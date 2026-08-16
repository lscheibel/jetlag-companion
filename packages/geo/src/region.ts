import simplify from "@turf/simplify";
import {
	type ClipMultiPolygon,
	type ClipPair,
	difference,
	intersection,
	union,
} from "./clipping";
import { contentHash } from "./hash";
import type {
	MultiPolygon,
	PolygonXY,
	Projection,
	Projector,
	Region,
	RingXY,
	XY,
} from "./types";

/**
 * The half-extent of the universe, in projected metres.
 *
 * A half-plane is unbounded and `exclude` is a complement, so both need a
 * finite universe to be expressed as polygons. 20 000 km comfortably contains
 * any UTM zone, whose eastings run 100–900 km and northings 0–10 000 km.
 */
export const WORLD_EXTENT_METERS = 2e7;

export const EMPTY_REGION: Region = { polygons: [] };

export const WORLD_REGION: Region = {
	polygons: [
		[
			[
				[-WORLD_EXTENT_METERS, -WORLD_EXTENT_METERS],
				[WORLD_EXTENT_METERS, -WORLD_EXTENT_METERS],
				[WORLD_EXTENT_METERS, WORLD_EXTENT_METERS],
				[-WORLD_EXTENT_METERS, WORLD_EXTENT_METERS],
				[-WORLD_EXTENT_METERS, -WORLD_EXTENT_METERS],
			],
		],
	],
};

export function isEmptyRegion(region: Region): boolean {
	return region.polygons.length === 0;
}

// --- boolean operations -----------------------------------------------------

function toClipping(region: Region): ClipMultiPolygon {
	return region.polygons.map((polygon) =>
		polygon.map((ring) => ring.map(([x, y]) => [x, y] as ClipPair)),
	);
}

function fromClipping(multi: ClipMultiPolygon): Region {
	return { polygons: multi };
}

export function intersectRegions(a: Region, b: Region): Region {
	if (isEmptyRegion(a) || isEmptyRegion(b)) return EMPTY_REGION;
	return fromClipping(intersection(toClipping(a), toClipping(b)));
}

export function unionRegions(a: Region, b: Region): Region {
	if (isEmptyRegion(a)) return b;
	if (isEmptyRegion(b)) return a;
	return fromClipping(union(toClipping(a), toClipping(b)));
}

export function subtractRegions(a: Region, b: Region): Region {
	if (isEmptyRegion(a)) return EMPTY_REGION;
	if (isEmptyRegion(b)) return a;
	return fromClipping(difference(toClipping(a), toClipping(b)));
}

export function complementRegion(region: Region): Region {
	return subtractRegions(WORLD_REGION, region);
}

// --- construction -----------------------------------------------------------

/**
 * Circles are densified to a fixed vertex count so that a given radius always
 * produces byte-identical geometry on every device. m0-spec §9.
 */
export const CIRCLE_SEGMENTS = 64;

export function circleRegion(
	center: XY,
	radiusMeters: number,
	segments: number = CIRCLE_SEGMENTS,
): Region {
	if (radiusMeters <= 0) return EMPTY_REGION;
	const ring: XY[] = [];
	for (let i = 0; i < segments; i++) {
		const angle = (2 * Math.PI * i) / segments;
		ring.push([
			center[0] + radiusMeters * Math.cos(angle),
			center[1] + radiusMeters * Math.sin(angle),
		]);
	}
	ring.push(ring[0] as XY);
	return { polygons: [[ring]] };
}

/**
 * Every point nearer to `a` than to `b` (or the reverse): the thermometer's
 * geometry, and the half of the plane on one side of the bisector of a–b.
 */
export function halfPlaneRegion(a: XY, b: XY, nearer: "a" | "b"): Region {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const length = Math.hypot(dx, dy);
	if (length === 0) {
		// The two positions coincide, so the question separates nothing.
		return WORLD_REGION;
	}

	const sign = nearer === "a" ? 1 : -1;
	// Unit vector pointing from the bisector into the retained half.
	const nx = (-dx / length) * sign;
	const ny = (-dy / length) * sign;
	// Along the bisector itself.
	const px = -ny;
	const py = nx;

	const mx = (a[0] + b[0]) / 2;
	const my = (a[1] + b[1]) / 2;
	const reach = WORLD_EXTENT_METERS * 2;

	const corners: XY[] = [
		[mx + px * reach, my + py * reach],
		[mx - px * reach, my - py * reach],
		[mx - px * reach + nx * reach, my - py * reach + ny * reach],
		[mx + px * reach + nx * reach, my + py * reach + ny * reach],
	];
	const ring: XY[] = [...corners, corners[0] as XY];
	return intersectRegions({ polygons: [[ring]] }, WORLD_REGION);
}

/**
 * A pie slice. Bearings are compass degrees — 0 is north, increasing clockwise
 * — because that is the only form a player ever reads off a map.
 * The sector runs clockwise from `fromDeg` to `toDeg`.
 */
export function sectorRegion(
	center: XY,
	radiusMeters: number,
	fromDeg: number,
	toDeg: number,
	segments: number = CIRCLE_SEGMENTS,
): Region {
	if (radiusMeters <= 0) return EMPTY_REGION;

	const sweep = normalizeSweep(toDeg - fromDeg);
	if (sweep === 0) return EMPTY_REGION;
	if (sweep >= 360) return circleRegion(center, radiusMeters, segments);

	const steps = Math.max(2, Math.ceil((segments * sweep) / 360));
	const ring: XY[] = [center];
	for (let i = 0; i <= steps; i++) {
		const bearing = fromDeg + (sweep * i) / steps;
		const angle = ((90 - bearing) * Math.PI) / 180;
		ring.push([
			center[0] + radiusMeters * Math.cos(angle),
			center[1] + radiusMeters * Math.sin(angle),
		]);
	}
	ring.push(center);
	return { polygons: [[ring]] };
}

function normalizeSweep(degrees: number): number {
	if (degrees >= 360 || degrees <= -360) return 360;
	return degrees < 0 ? degrees + 360 : degrees;
}

// --- projection boundaries --------------------------------------------------

export function multiPolygonToRegion(
	multi: MultiPolygon,
	projector: Projector,
): Region {
	return {
		polygons: multi.map((polygon) =>
			polygon.map((ring) => ring.map((point) => projector.forward(point))),
		),
	};
}

export function regionToMultiPolygon(
	region: Region,
	projector: Projector,
): MultiPolygon {
	return region.polygons.map((polygon) =>
		polygon.map((ring) => ring.map((point) => projector.inverse(point))),
	);
}

// --- numerical hygiene ------------------------------------------------------

function snapRing(ring: RingXY, precision: number): XY[] {
	const snapped: XY[] = [];
	for (const [x, y] of ring) {
		const point: XY = [
			Math.round(x / precision) * precision,
			Math.round(y / precision) * precision,
		];
		const previous = snapped[snapped.length - 1];
		if (previous && previous[0] === point[0] && previous[1] === point[1]) {
			continue;
		}
		snapped.push(point);
	}
	return snapped;
}

function closeRing(ring: readonly XY[]): XY[] {
	const open = [...ring];
	const first = open[0];
	if (!first) return [];
	const last = open[open.length - 1] as XY;
	if (last[0] === first[0] && last[1] === first[1]) {
		open.pop();
	}
	if (open.length < 3) return [];
	return [...open, open[0] as XY];
}

function ringArea(ring: RingXY): number {
	let sum = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const a = ring[i] as XY;
		const b = ring[i + 1] as XY;
		sum += a[0] * b[1] - b[0] * a[1];
	}
	return sum / 2;
}

/**
 * Repeated boolean operations on unions of hundreds of buffered circles
 * accumulate slivers and near-duplicate vertices. Snapping and simplification
 * between fold steps are part of the engine, not a later optimisation.
 * m0-spec §9.
 */
export function snapRegion(region: Region, precisionMeters: number): Region {
	if (precisionMeters <= 0) return region;
	const polygons: PolygonXY[] = [];
	for (const polygon of region.polygons) {
		const rings: RingXY[] = [];
		for (const ring of polygon) {
			const closed = closeRing(snapRing(ring, precisionMeters));
			if (closed.length >= 4 && Math.abs(ringArea(closed)) > 0) {
				rings.push(closed);
			}
		}
		// A polygon whose outer ring collapsed contributes nothing, holes included.
		if (rings.length > 0) polygons.push(rings);
	}
	return { polygons };
}

export function simplifyRegion(
	region: Region,
	toleranceMeters: number,
): Region {
	if (toleranceMeters <= 0 || isEmptyRegion(region)) return region;

	const coordinates = region.polygons.map((polygon) =>
		polygon.map((ring) => ring.map(([x, y]) => [x, y])),
	);
	const simplified = simplify({ type: "MultiPolygon", coordinates } as never, {
		tolerance: toleranceMeters,
		highQuality: false,
		mutate: true,
	}) as unknown as { coordinates: number[][][][] };

	const polygons: PolygonXY[] = [];
	for (const polygon of simplified.coordinates) {
		const rings: RingXY[] = [];
		for (const ring of polygon) {
			const closed = closeRing(ring.map(([x, y]) => [x, y] as XY));
			if (closed.length >= 4 && Math.abs(ringArea(closed)) > 0) {
				rings.push(closed);
			}
		}
		if (rings.length > 0) polygons.push(rings);
	}
	return { polygons };
}

function compareXY(a: XY, b: XY): number {
	return a[0] - b[0] || a[1] - b[1];
}

function compareRings(a: RingXY, b: RingXY): number {
	const shared = Math.min(a.length, b.length);
	for (let i = 0; i < shared; i++) {
		const order = compareXY(a[i] as XY, b[i] as XY);
		if (order !== 0) return order;
	}
	return a.length - b.length;
}

/** Rotate a closed ring so it begins at its lexicographically smallest vertex. */
function rotateRing(ring: RingXY): XY[] {
	const open = ring.slice(0, -1);
	if (open.length === 0) return [];
	let pivot = 0;
	for (let i = 1; i < open.length; i++) {
		if (compareXY(open[i] as XY, open[pivot] as XY) < 0) pivot = i;
	}
	const rotated = [...open.slice(pivot), ...open.slice(0, pivot)];
	return [...rotated, rotated[0] as XY];
}

function orientRing(ring: RingXY, clockwise: boolean): XY[] {
	const area = ringArea(ring);
	const isClockwise = area < 0;
	return isClockwise === clockwise ? [...ring] : [...ring].reverse();
}

/**
 * One geometry, one byte sequence. Winding, ring rotation and ordering are all
 * pinned so that two devices computing the same area produce the same bytes —
 * which is what makes the cache key and acceptance test 5 meaningful.
 */
export function canonicalizeRegion(region: Region): Region {
	const polygons: PolygonXY[] = [];
	for (const polygon of region.polygons) {
		const [outer, ...holes] = polygon;
		if (!outer) continue;
		const canonicalOuter = rotateRing(orientRing(outer, false));
		const canonicalHoles = holes
			.map((hole) => rotateRing(orientRing(hole, true)))
			.filter((hole) => hole.length >= 4)
			.sort(compareRings);
		if (canonicalOuter.length < 4) continue;
		polygons.push([canonicalOuter, ...canonicalHoles]);
	}
	polygons.sort((a, b) => compareRings(a[0] as RingXY, b[0] as RingXY));
	return { polygons };
}

/** Snap, simplify, canonicalize — the normal form every fold step ends in. */
export function normalizeRegion(
	region: Region,
	projection: Projection,
): Region {
	return canonicalizeRegion(
		simplifyRegion(
			snapRegion(region, projection.snapPrecisionMeters),
			projection.simplifyToleranceMeters,
		),
	);
}

// --- measurement ------------------------------------------------------------

/** Square metres. Holes subtract, because their winding is opposite. */
export function regionArea(region: Region): number {
	let total = 0;
	for (const polygon of region.polygons) {
		for (let i = 0; i < polygon.length; i++) {
			const area = ringArea(polygon[i] as RingXY);
			total += i === 0 ? Math.abs(area) : -Math.abs(area);
		}
	}
	return total;
}

function ringCrossings(ring: RingXY, point: XY): number {
	let crossings = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const a = ring[i] as XY;
		const b = ring[i + 1] as XY;
		if (a[1] > point[1] !== b[1] > point[1]) {
			const t = (point[1] - a[1]) / (b[1] - a[1]);
			if (point[0] < a[0] + t * (b[0] - a[0])) crossings++;
		}
	}
	return crossings;
}

/**
 * Point-in-region by ray casting. Odd crossings across all of a polygon's
 * rings means inside, which makes holes fall out for free.
 *
 * Points exactly on an edge are undefined, as they are for any such test.
 */
export function regionContainsXY(region: Region, point: XY): boolean {
	for (const polygon of region.polygons) {
		let crossings = 0;
		for (const ring of polygon) {
			crossings += ringCrossings(ring, point);
		}
		if (crossings % 2 === 1) return true;
	}
	return false;
}

export function regionHash(region: Region): string {
	return contentHash(
		region.polygons.map((polygon) =>
			polygon.map((ring) => ring.map(([x, y]) => [x, y])),
		),
	);
}
