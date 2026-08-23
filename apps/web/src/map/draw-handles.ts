import { type LngLat, offsetLngLat } from "@zero-lag/geo";

/**
 * Hit slop for a 44 px target: 22 px from the handle's centre. m3-spec §9.
 */
export const HIT_SLOP_PX = 22;

export type ScreenPoint = {
	readonly x: number;
	readonly y: number;
};

export type DrawHandle =
	| { readonly kind: "radius-center" }
	| { readonly kind: "radius-edge" }
	| { readonly kind: "vertex"; readonly index: number };

export type HandleTarget = {
	readonly handle: DrawHandle;
	readonly point: LngLat;
};

export function radiusHandles(
	center: LngLat | null,
	radiusMeters: number,
): readonly HandleTarget[] {
	if (!center) return [];
	return [
		{ handle: { kind: "radius-center" }, point: center },
		{
			handle: { kind: "radius-edge" },
			point: offsetLngLat(center, radiusMeters, 0),
		},
	];
}

export function ringHandles(
	points: readonly LngLat[],
): readonly HandleTarget[] {
	return points.map((point, index) => ({
		handle: { kind: "vertex", index },
		point,
	}));
}

export type RingEdgeHit = {
	readonly insertIndex: number;
	readonly point: LngLat;
};

function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function ringEdges(
	points: readonly LngLat[],
	closed: boolean,
): readonly { readonly start: number; readonly end: number }[] {
	if (points.length < 2) return [];
	const edges: { start: number; end: number }[] = [];
	for (let index = 0; index < points.length - 1; index++) {
		edges.push({ start: index, end: index + 1 });
	}
	if (closed && points.length >= 3) {
		edges.push({ start: points.length - 1, end: 0 });
	}
	return edges;
}

/** Geographic midpoints of each drawn edge, including the closing edge when the ring is closed. */
export function ringMidpoints(
	points: readonly LngLat[],
	closed: boolean,
): readonly LngLat[] {
	return ringEdges(points, closed).flatMap((edge) => {
		const start = points[edge.start];
		const end = points[edge.end];
		if (!start || !end) return [];
		return [lerpLngLat(start, end, 0.5)];
	});
}

function closestOnSegment(
	start: ScreenPoint,
	end: ScreenPoint,
	pointer: ScreenPoint,
): { t: number; dist: number } {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq === 0) {
		return {
			t: 0,
			dist: Math.hypot(pointer.x - start.x, pointer.y - start.y),
		};
	}
	const t = Math.max(
		0,
		Math.min(
			1,
			((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSq,
		),
	);
	const x = start.x + t * dx;
	const y = start.y + t * dy;
	return { t, dist: Math.hypot(pointer.x - x, pointer.y - y) };
}

/**
 * Nearest edge within slop, excluding the vertices themselves. Call after
 * `hitHandle` on `ringHandles` so a corner still wins over the segments that
 * meet there.
 */
export function hitRingEdge(
	points: readonly LngLat[],
	pointer: ScreenPoint,
	project: (point: LngLat) => ScreenPoint,
	closed: boolean,
	slopPx: number = HIT_SLOP_PX,
): RingEdgeHit | null {
	let best: { insertIndex: number; point: LngLat; dist: number } | null = null;
	for (const edge of ringEdges(points, closed)) {
		const start = points[edge.start];
		const end = points[edge.end];
		if (!start || !end) continue;
		const { t, dist } = closestOnSegment(project(start), project(end), pointer);
		if (dist > slopPx || t <= 0 || t >= 1) continue;
		if (best && dist >= best.dist) continue;
		best = {
			insertIndex: edge.start + 1,
			point: lerpLngLat(start, end, t),
			dist,
		};
	}
	return best ? { insertIndex: best.insertIndex, point: best.point } : null;
}

/**
 * Nearest handle within slop wins. Equal distance keeps the earlier handle, so
 * a radius whose edge has collapsed onto its centre still moves the centre.
 */
export function hitHandle(
	handles: readonly HandleTarget[],
	pointer: ScreenPoint,
	project: (point: LngLat) => ScreenPoint,
	slopPx: number = HIT_SLOP_PX,
): DrawHandle | null {
	let best: { handle: DrawHandle; dist: number } | null = null;
	for (const target of handles) {
		const screen = project(target.point);
		const dist = Math.hypot(pointer.x - screen.x, pointer.y - screen.y);
		if (dist > slopPx) continue;
		if (!best || dist < best.dist) best = { handle: target.handle, dist };
	}
	return best?.handle ?? null;
}
