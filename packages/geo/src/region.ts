import simplify from "@turf/simplify";
import {
	type ClipMultiPolygon,
	type ClipPair,
	difference,
	intersection,
	union,
} from "./clipping";
import {
	type DegreeScale,
	metersPerDegree,
	offsetLngLat,
	ringAreaMeters,
} from "./geodesic";
import { contentHash } from "./hash";
import type {
	BBox,
	LngLat,
	MultiPolygon,
	Polygon,
	Region,
	Ring,
	Tolerances,
} from "./types";

/**
 * Regions are WGS84 lng/lat, and so is every operation here. m0-spec §9.
 *
 * Booleans are topological: two polygons that overlap on the ground overlap in
 * degree space, and every containment result survives the mapping. What the
 * degree plane gives you is a *distorted* picture — at Berlin one degree of
 * longitude is 67.9 km against 111.3 km of latitude — and distortion is not
 * error. Where a metre is genuinely needed, it comes from `geodesic.ts`.
 */

export const EMPTY_REGION: Region = { polygons: [] };

/**
 * The whole ellipsoid, as a polygon.
 *
 * `exclude` is a complement and a complement needs a finite universe. In
 * degrees that universe is simply the coordinate range, which is a good deal
 * easier to believe in than the 20,000 km square the projected version needed.
 */
export const WORLD_REGION: Region = {
	polygons: [
		[
			[
				[-180, -90],
				[180, -90],
				[180, 90],
				[-180, 90],
				[-180, -90],
			],
		],
	],
};

export const DEFAULT_TOLERANCES: Tolerances = {
	snapPrecisionMeters: 0.1,
	simplifyToleranceMeters: 1,
};

export function isEmptyRegion(region: Region): boolean {
	return region.polygons.length === 0;
}

// --- boolean operations -----------------------------------------------------

function toClipping(region: Region): ClipMultiPolygon {
	return region.polygons.map((polygon) =>
		polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat] as ClipPair)),
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
 *
 * The same budget densifies every other curved edge in this file, because the
 * reason is the same one: a straight line in degrees is not a straight line on
 * the ground, and the fix is more vertices rather than a cleverer edge.
 */
export const CIRCLE_SEGMENTS = 64;

export function circleRegion(
	center: LngLat,
	radiusMeters: number,
	segments: number = CIRCLE_SEGMENTS,
): Region {
	if (radiusMeters <= 0) return EMPTY_REGION;
	const ring: LngLat[] = [];
	for (let i = 0; i < segments; i++) {
		const angle = (2 * Math.PI * i) / segments;
		ring.push(
			offsetLngLat(
				center,
				radiusMeters * Math.cos(angle),
				radiusMeters * Math.sin(angle),
			),
		);
	}
	ring.push(ring[0] as LngLat);
	return { polygons: [[ring]] };
}

/**
 * The same circle as bare geometry, for drawing rather than folding.
 *
 * One densification, shared by radar's constraint, M2's accuracy ring and M3's
 * radius tool. Two implementations of one idea drift, and the symptom shows up
 * as a geometry bug long before anyone suspects duplication. m0-spec §9.
 */
export function circleLngLat(
	center: LngLat,
	radiusMeters: number,
	segments: number = CIRCLE_SEGMENTS,
): MultiPolygon {
	return circleRegion(center, radiusMeters, segments).polygons;
}

/**
 * The extent of a stored area, in degrees. M2 derives the map's opening camera
 * from this rather than storing one, because a stored camera goes stale the
 * moment M4 lets a host redraw the area. m2-spec §2.
 *
 * Null for an empty geometry: a bounding box of nothing is not a box, and the
 * caller has to fall back on something else anyway.
 */
export function multiPolygonBBox(multi: MultiPolygon): BBox | null {
	let minLng = Number.POSITIVE_INFINITY;
	let minLat = Number.POSITIVE_INFINITY;
	let maxLng = Number.NEGATIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;

	for (const polygon of multi) {
		// Holes lie inside the outer ring, so only ring 0 can move an edge.
		const outer = polygon[0];
		if (!outer) continue;
		for (const [lng, lat] of outer) {
			if (lng < minLng) minLng = lng;
			if (lat < minLat) minLat = lat;
			if (lng > maxLng) maxLng = lng;
			if (lat > maxLat) maxLat = lat;
		}
	}

	if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
	return [minLng, minLat, maxLng, maxLat];
}

/**
 * How far a half-plane reaches before it stops being a half-plane.
 *
 * A half-plane is unbounded and a polygon is not, so one of them has to give.
 * 2,000 km from the midpoint of the two positions covers any game this app will
 * ever host — Germany is 900 km end to end — and the region is intersected with
 * a bounded search area on every path that uses it.
 */
const HALF_PLANE_REACH_METERS = 2e6;

/**
 * Every point nearer to `a` than to `b` (or the reverse): the thermometer's
 * geometry, and the half of the world on one side of the bisector of a–b.
 *
 * Built by walking metres from the midpoint and landing each vertex through
 * `offsetLngLat`, so the boundary follows the ellipsoid rather than a chord
 * through degree space. **The boundary edge is densified** for the same reason
 * a circle is: over hundreds of kilometres a two-point edge would cut the
 * corner off a curve, and this is the one edge whose position is the answer.
 */
export function halfPlaneRegion(
	a: LngLat,
	b: LngLat,
	nearer: "a" | "b",
	segments: number = CIRCLE_SEGMENTS,
): Region {
	const scale = metersPerDegree((a[1] + b[1]) / 2);
	// The a→b vector in metres, which is what the bisector is perpendicular to.
	const dx = (b[0] - a[0]) * scale.lng;
	const dy = (b[1] - a[1]) * scale.lat;
	const length = Math.hypot(dx, dy);
	if (length === 0) {
		// The two positions coincide, so the question separates nothing.
		return WORLD_REGION;
	}

	const midpoint: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const sign = nearer === "a" ? 1 : -1;
	// Unit vector from the bisector into the retained half...
	const nx = (-dx / length) * sign;
	const ny = (-dy / length) * sign;
	// ...and along the bisector itself.
	const px = -ny;
	const py = nx;

	const reach = HALF_PLANE_REACH_METERS;
	const ring: LngLat[] = [];
	// The bisector, densified from one end to the other.
	for (let i = 0; i <= segments; i++) {
		const t = reach * (1 - (2 * i) / segments);
		ring.push(offsetLngLat(midpoint, px * t, py * t));
	}
	// Then out to the retained side and back, which no game ever reaches.
	ring.push(
		offsetLngLat(midpoint, -px * reach + nx * reach, -py * reach + ny * reach),
	);
	ring.push(
		offsetLngLat(midpoint, px * reach + nx * reach, py * reach + ny * reach),
	);
	ring.push(ring[0] as LngLat);

	return intersectRegions({ polygons: [[ring]] }, WORLD_REGION);
}

/**
 * The Voronoi cell of `selected` among `selected` plus `others`: every point
 * nearer to `selected` than to any other site.
 *
 * Built as the intersection of half-planes (one bisector per neighbour) so it
 * uses the same geodesic edge as the thermometer. Clip to a bounded region —
 * the game's valid hiding area — rather than to the current search fold, or
 * other constraints leak into this one. An optional radius then cuts the cell
 * down to a disc around the selected site.
 */
export function closestSiteRegion(
	selected: LngLat,
	others: readonly LngLat[],
	options?: {
		readonly radiusMeters?: number;
		readonly clip?: Region;
		readonly tolerances?: Tolerances;
	},
): Region {
	const tolerances = options?.tolerances;
	let cell = options?.clip ?? WORLD_REGION;
	for (const other of others) {
		cell = intersectRegions(cell, halfPlaneRegion(selected, other, "a"));
		if (isEmptyRegion(cell)) break;
	}
	const radius = options?.radiusMeters;
	if (radius !== undefined && radius > 0) {
		cell = intersectRegions(cell, circleRegion(selected, radius));
	}
	return normalizeRegion(cell, tolerances);
}

/**
 * A pie slice. Bearings are compass degrees — 0 is north, increasing clockwise
 * — because that is the only form a player ever reads off a map.
 * The sector runs clockwise from `fromDeg` to `toDeg`.
 */
export function sectorRegion(
	center: LngLat,
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
	const ring: LngLat[] = [center];
	for (let i = 0; i <= steps; i++) {
		const bearing = fromDeg + (sweep * i) / steps;
		const angle = ((90 - bearing) * Math.PI) / 180;
		ring.push(
			offsetLngLat(
				center,
				radiusMeters * Math.cos(angle),
				radiusMeters * Math.sin(angle),
			),
		);
	}
	ring.push(center);
	return { polygons: [[ring]] };
}

function normalizeSweep(degrees: number): number {
	if (degrees >= 360 || degrees <= -360) return 360;
	return degrees < 0 ? degrees + 360 : degrees;
}

// --- geometry in and out ----------------------------------------------------

export function multiPolygonToRegion(multi: MultiPolygon): Region {
	return { polygons: multi };
}

export function regionToMultiPolygon(region: Region): MultiPolygon {
	return region.polygons;
}

// --- numerical hygiene ------------------------------------------------------

/**
 * The scale tolerances are read at — fixed, at the equator, on purpose.
 *
 * A tolerance is a *threshold*, not a measurement: 0.1 m of snapping and 1 m of
 * simplification, chosen to collapse near-duplicate vertices rather than to
 * describe anything. Read at the equator it is at most 1% coarser in latitude
 * anywhere on Earth, and finer in longitude — which makes simplification a
 * little more conservative at high latitudes and costs nothing else.
 *
 * The first draft of this read the scale from the region's own bounding box, to
 * get a grid that was square on the ground. It was square on the ground and it
 * was also **not idempotent**: snapping moves vertices, moving vertices moves
 * the bounding box, and the second pass therefore chose a slightly different
 * grid and moved everything again. A normal form cannot depend on a quantity
 * the normal form itself changes.
 *
 * Construction and measurement — where a scale error *is* a geometry error —
 * are per-point and per-latitude in `geodesic.ts`. This is the one place a
 * fixed figure is the right answer rather than the lazy one.
 */
const TOLERANCE_SCALE: DegreeScale = metersPerDegree(0);

function snapRing(
	ring: Ring,
	precisionLng: number,
	precisionLat: number,
): LngLat[] {
	const snapped: LngLat[] = [];
	for (const [lng, lat] of ring) {
		const point: LngLat = [
			Math.round(lng / precisionLng) * precisionLng,
			Math.round(lat / precisionLat) * precisionLat,
		];
		const previous = snapped[snapped.length - 1];
		if (previous && previous[0] === point[0] && previous[1] === point[1]) {
			continue;
		}
		snapped.push(point);
	}
	return snapped;
}

function closeRing(ring: readonly LngLat[]): LngLat[] {
	const open = [...ring];
	const first = open[0];
	if (!first) return [];
	const last = open[open.length - 1] as LngLat;
	if (last[0] === first[0] && last[1] === first[1]) {
		open.pop();
	}
	if (open.length < 3) return [];
	return [...open, open[0] as LngLat];
}

/**
 * Planar shoelace, in degrees — a question about winding and collapse, not a
 * measurement. `ringAreaMeters` is the one that answers "how big".
 */
function ringArea(ring: Ring): number {
	let sum = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const a = ring[i] as LngLat;
		const b = ring[i + 1] as LngLat;
		sum += a[0] * b[1] - b[0] * a[1];
	}
	return sum / 2;
}

/**
 * Repeated boolean operations on unions of hundreds of circles accumulate
 * slivers and near-duplicate vertices. Snapping and simplification between fold
 * steps are part of the engine, not a later optimisation. m0-spec §9.
 *
 * The grid is per-axis because a degree of longitude and a degree of latitude
 * are different lengths, and it is fixed rather than local — see
 * `TOLERANCE_SCALE` for why that is the idempotent choice.
 */
export function snapRegion(region: Region, precisionMeters: number): Region {
	if (precisionMeters <= 0 || isEmptyRegion(region)) return region;
	const precisionLng = precisionMeters / TOLERANCE_SCALE.lng;
	const precisionLat = precisionMeters / TOLERANCE_SCALE.lat;

	const polygons: Polygon[] = [];
	for (const polygon of region.polygons) {
		const rings: Ring[] = [];
		for (const ring of polygon) {
			const closed = closeRing(snapRing(ring, precisionLng, precisionLat));
			if (closed.length >= 4 && Math.abs(ringArea(closed)) > 0) {
				rings.push(closed);
			}
		}
		// A polygon whose outer ring collapsed contributes nothing, holes included.
		if (rings.length > 0) polygons.push(rings);
	}
	return { polygons };
}

/**
 * Douglas–Peucker wants one tolerance and degrees are not metres, so the ring
 * is scaled into metres, simplified, and scaled back.
 *
 * That is a projection, admittedly — it is also a single multiply rather than a
 * stored, configured CRS with round trips, and it lives inside the one function
 * that needs it rather than threaded through every signature in the package.
 * Read at `TOLERANCE_SCALE`, so a metre of tolerance is between 0.3 m and 1 m
 * of real east–west tolerance depending on latitude — always in the
 * conservative direction, which for a simplifier means keeping a vertex it
 * could have dropped. m0-spec §9.
 */
export function simplifyRegion(
	region: Region,
	toleranceMeters: number,
): Region {
	if (toleranceMeters <= 0 || isEmptyRegion(region)) return region;
	const scale = TOLERANCE_SCALE;

	const coordinates = region.polygons.map((polygon) =>
		polygon.map((ring) =>
			ring.map(([lng, lat]) => [lng * scale.lng, lat * scale.lat]),
		),
	);
	const simplified = simplify({ type: "MultiPolygon", coordinates } as never, {
		tolerance: toleranceMeters,
		highQuality: false,
		mutate: true,
	}) as unknown as { coordinates: number[][][][] };

	const polygons: Polygon[] = [];
	for (const polygon of simplified.coordinates) {
		const rings: Ring[] = [];
		for (const ring of polygon) {
			const closed = closeRing(
				ring.map(
					([x, y]) =>
						[(x as number) / scale.lng, (y as number) / scale.lat] as LngLat,
				),
			);
			if (closed.length >= 4 && Math.abs(ringArea(closed)) > 0) {
				rings.push(closed);
			}
		}
		if (rings.length > 0) polygons.push(rings);
	}
	return { polygons };
}

function comparePoints(a: LngLat, b: LngLat): number {
	return a[0] - b[0] || a[1] - b[1];
}

function compareRings(a: Ring, b: Ring): number {
	const shared = Math.min(a.length, b.length);
	for (let i = 0; i < shared; i++) {
		const order = comparePoints(a[i] as LngLat, b[i] as LngLat);
		if (order !== 0) return order;
	}
	return a.length - b.length;
}

/** Rotate a closed ring so it begins at its lexicographically smallest vertex. */
function rotateRing(ring: Ring): LngLat[] {
	const open = ring.slice(0, -1);
	if (open.length === 0) return [];
	let pivot = 0;
	for (let i = 1; i < open.length; i++) {
		if (comparePoints(open[i] as LngLat, open[pivot] as LngLat) < 0) pivot = i;
	}
	const rotated = [...open.slice(pivot), ...open.slice(0, pivot)];
	return [...rotated, rotated[0] as LngLat];
}

function orientRing(ring: Ring, clockwise: boolean): LngLat[] {
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
	const polygons: Polygon[] = [];
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
	polygons.sort((a, b) => compareRings(a[0] as Ring, b[0] as Ring));
	return { polygons };
}

/** Snap, simplify, canonicalize — the normal form every fold step ends in. */
export function normalizeRegion(
	region: Region,
	tolerances: Tolerances = DEFAULT_TOLERANCES,
): Region {
	return canonicalizeRegion(
		simplifyRegion(
			snapRegion(region, tolerances.snapPrecisionMeters),
			tolerances.simplifyToleranceMeters,
		),
	);
}

// --- measurement ------------------------------------------------------------

/**
 * Square metres, on the ellipsoid. Holes subtract, because their winding is
 * opposite.
 *
 * Geodesic rather than planar: a shoelace over degrees would produce square
 * degrees, whose relation to ground area changes with latitude — fine as a
 * ratio inside one city, and off by a sixth across Germany, which is exactly
 * the scale M13's "share of the area eliminated" is claimed at.
 */
export function regionArea(region: Region): number {
	let total = 0;
	for (const polygon of region.polygons) {
		for (let i = 0; i < polygon.length; i++) {
			const area = ringAreaMeters(polygon[i] as Ring);
			total += i === 0 ? Math.abs(area) : -Math.abs(area);
		}
	}
	return total;
}

function ringCrossings(ring: Ring, point: LngLat): number {
	let crossings = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const a = ring[i] as LngLat;
		const b = ring[i + 1] as LngLat;
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
 * Correct in degrees for the same reason the booleans are: this is a question
 * about topology, and the mapping preserves it.
 *
 * Points exactly on an edge are undefined, as they are for any such test.
 */
export function regionContains(region: Region, point: LngLat): boolean {
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
			polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
		),
	);
}
