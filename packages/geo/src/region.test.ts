import { describe, expect, it } from "vitest";
import { BERLIN_PROJECTION, createProjector } from "./projection";
import {
	CIRCLE_SEGMENTS,
	circleRegion,
	complementRegion,
	halfPlaneRegion,
	intersectRegions,
	isEmptyRegion,
	normalizeRegion,
	regionArea,
	regionContainsXY,
	regionHash,
	sectorRegion,
	subtractRegions,
	WORLD_REGION,
} from "./region";
import type { LngLat } from "./types";

const projector = createProjector(BERLIN_PROJECTION);

/** Alexanderplatz. */
const ALEX: LngLat = [13.4132, 52.5219];
/** Zoologischer Garten, about 6.5 km west. */
const ZOO: LngLat = [13.3327, 52.5073];

describe("projection", () => {
	it("round-trips a Berlin coordinate to sub-millimetre", () => {
		const [lng, lat] = projector.inverse(projector.forward(ALEX));
		expect(lng).toBeCloseTo(ALEX[0], 9);
		expect(lat).toBeCloseTo(ALEX[1], 9);
	});

	it("measures the distance between two stations in metres", () => {
		const a = projector.forward(ALEX);
		const b = projector.forward(ZOO);
		expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(5000);
		expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(8000);
	});
});

describe("circleRegion", () => {
	it("densifies to a fixed vertex count", () => {
		const ring = circleRegion(projector.forward(ALEX), 1000).polygons[0]?.[0];
		expect(ring).toHaveLength(CIRCLE_SEGMENTS + 1);
	});

	it("produces byte-identical geometry for identical inputs", () => {
		const a = circleRegion(projector.forward(ALEX), 1000);
		const b = circleRegion(projector.forward(ALEX), 1000);
		expect(regionHash(a)).toBe(regionHash(b));
	});

	it("approximates the true area of the disc", () => {
		const area = regionArea(circleRegion(projector.forward(ALEX), 1000));
		// A 64-gon inscribes slightly under the circle.
		expect(area / (Math.PI * 1000 * 1000)).toBeGreaterThan(0.99);
		expect(area / (Math.PI * 1000 * 1000)).toBeLessThanOrEqual(1);
	});

	it("is empty for a non-positive radius", () => {
		expect(isEmptyRegion(circleRegion([0, 0], 0))).toBe(true);
	});
});

describe("halfPlaneRegion", () => {
	it("keeps the side of the bisector containing the nearer point", () => {
		const a = projector.forward(ALEX);
		const b = projector.forward(ZOO);
		const nearA = halfPlaneRegion(a, b, "a");

		expect(regionContainsXY(nearA, a)).toBe(true);
		expect(regionContainsXY(nearA, b)).toBe(false);
	});

	it("flips when the nearer point flips", () => {
		const a = projector.forward(ALEX);
		const b = projector.forward(ZOO);
		const nearB = halfPlaneRegion(a, b, "b");

		expect(regionContainsXY(nearB, a)).toBe(false);
		expect(regionContainsXY(nearB, b)).toBe(true);
	});

	it("separates nothing when the two positions coincide", () => {
		const a = projector.forward(ALEX);
		expect(regionArea(halfPlaneRegion(a, a, "a"))).toBe(
			regionArea(WORLD_REGION),
		);
	});
});

describe("sectorRegion", () => {
	it("contains a point on its bearing and excludes the opposite one", () => {
		const center = projector.forward(ALEX);
		// A quarter pie facing east.
		const east = sectorRegion(center, 2000, 45, 135);
		expect(regionContainsXY(east, [center[0] + 1000, center[1]])).toBe(true);
		expect(regionContainsXY(east, [center[0] - 1000, center[1]])).toBe(false);
	});

	it("covers a quarter of the disc's area", () => {
		const center = projector.forward(ALEX);
		const quarter = regionArea(sectorRegion(center, 2000, 0, 90));
		const whole = regionArea(circleRegion(center, 2000));
		expect(quarter / whole).toBeCloseTo(0.25, 2);
	});

	it("is a full circle when the sweep wraps all the way round", () => {
		const center = projector.forward(ALEX);
		expect(regionArea(sectorRegion(center, 2000, 0, 360))).toBeCloseTo(
			regionArea(circleRegion(center, 2000)),
			6,
		);
	});
});

describe("boolean operations", () => {
	const center = projector.forward(ALEX);

	it("intersects two overlapping discs", () => {
		const a = circleRegion(center, 1000);
		const b = circleRegion([center[0] + 1000, center[1]], 1000);
		const overlap = intersectRegions(a, b);
		expect(regionArea(overlap)).toBeGreaterThan(0);
		expect(regionArea(overlap)).toBeLessThan(regionArea(a));
	});

	it("returns empty for disjoint discs", () => {
		const a = circleRegion(center, 500);
		const b = circleRegion([center[0] + 5000, center[1]], 500);
		expect(isEmptyRegion(intersectRegions(a, b))).toBe(true);
	});

	it("punches a hole when subtracting a contained disc", () => {
		const outer = circleRegion(center, 2000);
		const inner = circleRegion(center, 500);
		const ring = subtractRegions(outer, inner);
		expect(regionContainsXY(ring, [center[0] + 1000, center[1]])).toBe(true);
		expect(regionContainsXY(ring, center)).toBe(false);
	});

	it("complements to everything outside", () => {
		const disc = circleRegion(center, 1000);
		const outside = complementRegion(disc);
		expect(regionContainsXY(outside, center)).toBe(false);
		expect(regionContainsXY(outside, [center[0] + 5000, center[1]])).toBe(true);
	});
});

describe("normalizeRegion", () => {
	const center = projector.forward(ALEX);

	it("is idempotent", () => {
		const once = normalizeRegion(circleRegion(center, 1000), BERLIN_PROJECTION);
		const twice = normalizeRegion(once, BERLIN_PROJECTION);
		expect(regionHash(twice)).toBe(regionHash(once));
	});

	it("erases the difference between rotated and reversed rings", () => {
		const ring = circleRegion(center, 1000).polygons[0]?.[0];
		if (!ring) throw new Error("expected a ring");

		const open = ring.slice(0, -1);
		const rotated = [...open.slice(10), ...open.slice(0, 10)];
		const reversed = [...open].reverse();

		const hashes = [open, rotated, reversed].map((r) =>
			regionHash(
				normalizeRegion(
					{ polygons: [[[...r, r[0] as never]]] },
					BERLIN_PROJECTION,
				),
			),
		);
		expect(new Set(hashes).size).toBe(1);
	});
});
