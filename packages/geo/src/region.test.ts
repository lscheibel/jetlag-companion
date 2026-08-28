import { describe, expect, it } from "vitest";
import { distanceMeters, metersPerDegree, offsetLngLat } from "./geodesic";
import {
	CIRCLE_SEGMENTS,
	circleLngLat,
	circleRegion,
	closestSiteRegion,
	complementRegion,
	halfPlaneRegion,
	intersectRegions,
	isEmptyRegion,
	multiPolygonBBox,
	normalizeRegion,
	regionArea,
	regionContains,
	regionHash,
	sectorRegion,
	subtractRegions,
	WORLD_REGION,
} from "./region";
import type { LngLat, MultiPolygon } from "./types";

/** Alexanderplatz. */
const ALEX: LngLat = [13.4132, 52.5219];
/** Zoologischer Garten, about 6.5 km west. */
const ZOO: LngLat = [13.3327, 52.5073];

/** A point `east` metres east of `origin`, for tests that want one. */
function east(origin: LngLat, meters: number): LngLat {
	return offsetLngLat(origin, meters, 0);
}

describe("metersPerDegree", () => {
	/**
	 * The values this replaced were the equatorial constants, applied at every
	 * latitude. These are the numbers they should have been. m3-spec §4.
	 */
	it("gives the published degree lengths at the equator", () => {
		const equator = metersPerDegree(0);
		expect(equator.lat).toBeCloseTo(110_574, -1);
		expect(equator.lng).toBeCloseTo(111_320, -1);
	});

	it("grows the meridian and shrinks the parallel going north", () => {
		const berlin = metersPerDegree(52.5);
		expect(berlin.lat).toBeCloseTo(111_277, -1);
		expect(berlin.lng).toBeCloseTo(67_909, -1);
	});

	it("stays positive at the pole rather than dividing by zero", () => {
		expect(metersPerDegree(90).lng).toBeGreaterThan(0);
		expect(Number.isFinite(metersPerDegree(-90).lng)).toBe(true);
	});
});

describe("distanceMeters", () => {
	/**
	 * Reference values from Vincenty's own published test set, which is the
	 * point of testing against something other than ourselves.
	 */
	it("matches the published inverse-solution reference", () => {
		// Vincenty (1975), the classic Bessel-era pair recomputed on WGS84.
		expect(distanceMeters([0, 0], [0, 1])).toBeCloseTo(110_574.389, 1);
		expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111_319.491, 1);
	});

	it("is zero for a point and itself, and symmetric otherwise", () => {
		expect(distanceMeters(ALEX, ALEX)).toBe(0);
		expect(distanceMeters(ALEX, ZOO)).toBeCloseTo(distanceMeters(ZOO, ALEX), 6);
	});

	it("measures two Berlin stations", () => {
		const meters = distanceMeters(ALEX, ZOO);
		expect(meters).toBeGreaterThan(5_000);
		expect(meters).toBeLessThan(8_000);
	});

	/**
	 * The reason haversine was rejected: it is a sphere, and Germany is not on
	 * one. Hamburg to Munich is where the 0.5% starts costing kilometres.
	 */
	it("differs from a spherical approximation at national scale", () => {
		const hamburg: LngLat = [9.9937, 53.5511];
		const munich: LngLat = [11.582, 48.1351];
		expect(distanceMeters(hamburg, munich)).toBeGreaterThan(600_000);
		expect(distanceMeters(hamburg, munich)).toBeLessThan(620_000);
	});
});

describe("offsetLngLat", () => {
	it("walks the distance it was asked for, in every direction", () => {
		for (const [dx, dy] of [
			[1000, 0],
			[0, 1000],
			[-1000, 0],
			[0, -1000],
			[700, 700],
		]) {
			const landed = offsetLngLat(ALEX, dx as number, dy as number);
			expect(distanceMeters(ALEX, landed)).toBeCloseTo(
				Math.hypot(dx as number, dy as number),
				0,
			);
		}
	});

	it("stays accurate at latitudes far from the one it was written at", () => {
		for (const lat of [-33.9, 0, 47.5, 68.2]) {
			const origin: LngLat = [13.4, lat];
			expect(
				distanceMeters(origin, offsetLngLat(origin, 5_000, 0)),
			).toBeCloseTo(5_000, 0);
			expect(
				distanceMeters(origin, offsetLngLat(origin, 0, 5_000)),
			).toBeCloseTo(5_000, 0);
		}
	});
});

describe("circleRegion", () => {
	it("densifies to a fixed vertex count", () => {
		const ring = circleRegion(ALEX, 1000).polygons[0]?.[0];
		expect(ring).toHaveLength(CIRCLE_SEGMENTS + 1);
	});

	it("produces byte-identical geometry for identical inputs", () => {
		expect(regionHash(circleRegion(ALEX, 1000))).toBe(
			regionHash(circleRegion(ALEX, 1000)),
		);
	});

	it("approximates the true area of the disc", () => {
		const area = regionArea(circleRegion(ALEX, 1000));
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
		const nearA = halfPlaneRegion(ALEX, ZOO, "a");
		expect(regionContains(nearA, ALEX)).toBe(true);
		expect(regionContains(nearA, ZOO)).toBe(false);
	});

	it("flips when the nearer point flips", () => {
		const nearB = halfPlaneRegion(ALEX, ZOO, "b");
		expect(regionContains(nearB, ALEX)).toBe(false);
		expect(regionContains(nearB, ZOO)).toBe(true);
	});

	/**
	 * The boundary is the thing this geometry exists to place, so it is checked
	 * against a real distance rather than against the polygon that drew it.
	 */
	it("puts its boundary where the two distances are equal", () => {
		const nearA = halfPlaneRegion(ALEX, ZOO, "a");
		for (const meters of [-4000, -1500, 0, 1500, 4000]) {
			for (const northing of [-8000, 0, 8000]) {
				const probe = offsetLngLat(
					[(ALEX[0] + ZOO[0]) / 2, (ALEX[1] + ZOO[1]) / 2],
					meters,
					northing,
				);
				const truth = distanceMeters(probe, ALEX) < distanceMeters(probe, ZOO);
				expect(regionContains(nearA, probe)).toBe(truth);
			}
		}
	});

	it("separates nothing when the two positions coincide", () => {
		expect(regionArea(halfPlaneRegion(ALEX, ALEX, "a"))).toBe(
			regionArea(WORLD_REGION),
		);
	});
});

describe("closestSiteRegion", () => {
	const clip = circleRegion(ALEX, 8_000);

	it("keeps a probe nearer to the selected site and drops one nearer to a neighbour", () => {
		const cell = closestSiteRegion(ALEX, [ZOO], { clip });
		expect(regionContains(cell, east(ALEX, 200))).toBe(true);
		expect(regionContains(cell, east(ZOO, -200))).toBe(false);
	});

	it("puts its boundary where the two distances are equal", () => {
		const cell = closestSiteRegion(ALEX, [ZOO], { clip });
		const midpoint: LngLat = [(ALEX[0] + ZOO[0]) / 2, (ALEX[1] + ZOO[1]) / 2];
		expect(regionContains(cell, offsetLngLat(midpoint, 400, 0))).toBe(true);
		expect(regionContains(cell, offsetLngLat(midpoint, -400, 0))).toBe(false);
	});

	it("ignores a neighbour the caller omitted", () => {
		const outsider = east(ALEX, 3_000);
		const without = closestSiteRegion(ALEX, [ZOO], { clip });
		expect(regionContains(without, outsider)).toBe(true);
	});

	it("clips the cell to a disc around the selected site", () => {
		const cell = closestSiteRegion(ALEX, [ZOO], {
			clip,
			radiusMeters: 1_000,
		});
		expect(regionContains(cell, east(ALEX, 200))).toBe(true);
		expect(regionContains(cell, east(ALEX, 2_000))).toBe(false);
	});

	it("treats a coincident neighbour as a no-op", () => {
		const withTwin = closestSiteRegion(ALEX, [ALEX], { clip });
		const alone = closestSiteRegion(ALEX, [], { clip });
		expect(regionHash(withTwin)).toBe(regionHash(alone));
	});

	it("stays inside the clip", () => {
		const cell = closestSiteRegion(ALEX, [ZOO], { clip });
		expect(regionContains(cell, east(ALEX, 20_000))).toBe(false);
		expect(regionArea(cell)).toBeLessThanOrEqual(regionArea(clip));
	});

	it("equals the clip when there are no other sites and no radius", () => {
		const cell = closestSiteRegion(ALEX, [], { clip });
		expect(regionHash(cell)).toBe(regionHash(normalizeRegion(clip)));
	});
});

describe("sectorRegion", () => {
	it("contains a point on its bearing and excludes the opposite one", () => {
		// A quarter pie facing east.
		const facingEast = sectorRegion(ALEX, 2000, 45, 135);
		expect(regionContains(facingEast, east(ALEX, 1000))).toBe(true);
		expect(regionContains(facingEast, east(ALEX, -1000))).toBe(false);
	});

	it("covers a quarter of the disc's area", () => {
		const quarter = regionArea(sectorRegion(ALEX, 2000, 0, 90));
		const whole = regionArea(circleRegion(ALEX, 2000));
		expect(quarter / whole).toBeCloseTo(0.25, 2);
	});

	it("is a full circle when the sweep wraps all the way round", () => {
		expect(regionArea(sectorRegion(ALEX, 2000, 0, 360))).toBeCloseTo(
			regionArea(circleRegion(ALEX, 2000)),
			6,
		);
	});
});

describe("boolean operations", () => {
	it("intersects two overlapping discs", () => {
		const a = circleRegion(ALEX, 1000);
		const b = circleRegion(east(ALEX, 1000), 1000);
		const overlap = intersectRegions(a, b);
		expect(regionArea(overlap)).toBeGreaterThan(0);
		expect(regionArea(overlap)).toBeLessThan(regionArea(a));
	});

	it("returns empty for disjoint discs", () => {
		const a = circleRegion(ALEX, 500);
		const b = circleRegion(east(ALEX, 5000), 500);
		expect(isEmptyRegion(intersectRegions(a, b))).toBe(true);
	});

	it("punches a hole when subtracting a contained disc", () => {
		const ring = subtractRegions(
			circleRegion(ALEX, 2000),
			circleRegion(ALEX, 500),
		);
		expect(regionContains(ring, east(ALEX, 1000))).toBe(true);
		expect(regionContains(ring, ALEX)).toBe(false);
	});

	it("complements to everything outside", () => {
		const outside = complementRegion(circleRegion(ALEX, 1000));
		expect(regionContains(outside, ALEX)).toBe(false);
		expect(regionContains(outside, east(ALEX, 5000))).toBe(true);
	});
});

describe("normalizeRegion", () => {
	it("is idempotent", () => {
		const once = normalizeRegion(circleRegion(ALEX, 1000));
		expect(regionHash(normalizeRegion(once))).toBe(regionHash(once));
	});

	it("erases the difference between rotated and reversed rings", () => {
		const ring = circleRegion(ALEX, 1000).polygons[0]?.[0];
		if (!ring) throw new Error("expected a ring");

		const open = ring.slice(0, -1);
		const rotated = [...open.slice(10), ...open.slice(0, 10)];
		const reversed = [...open].reverse();

		const hashes = [open, rotated, reversed].map((r) =>
			regionHash(normalizeRegion({ polygons: [[[...r, r[0] as LngLat]]] })),
		);
		expect(new Set(hashes).size).toBe(1);
	});

	/**
	 * The tolerance grid is per-axis and **fixed**, which is what makes the
	 * normal form a fixed point. Deriving it from the region's own extent gives
	 * a grid that is squarer on the ground and is not idempotent, because
	 * snapping moves the extent it was derived from. m0-spec §9.
	 */
	it("snaps on a fixed per-axis grid", () => {
		const coarse = normalizeRegion(circleRegion(ALEX, 1000), {
			snapPrecisionMeters: 100,
			simplifyToleranceMeters: 0,
		});
		const scale = metersPerDegree(0);
		for (const [lng, lat] of coarse.polygons[0]?.[0] ?? []) {
			const gridLng = (lng * scale.lng) / 100;
			const gridLat = (lat * scale.lat) / 100;
			expect(Math.abs(gridLng - Math.round(gridLng))).toBeLessThan(1e-6);
			expect(Math.abs(gridLat - Math.round(gridLat))).toBeLessThan(1e-6);
		}
	});

	it("stays a fixed point however many times it is applied", () => {
		let region = normalizeRegion(circleRegion(ALEX, 1000));
		const settled = regionHash(region);
		for (let i = 0; i < 5; i++) region = normalizeRegion(region);
		expect(regionHash(region)).toBe(settled);
	});
});

/**
 * The ring M2 draws around own position, M3 draws around a radius tool, and
 * radar folds a constraint from. m2-spec §5, m3-spec §4.
 */
describe("circleLngLat", () => {
	it("densifies to the same vertex count as the folding circle", () => {
		const [polygon] = circleLngLat(ALEX, 50);
		expect(polygon?.[0]).toHaveLength(CIRCLE_SEGMENTS + 1);
	});

	/**
	 * The regression guard for the equatorial constants this replaced: they drew
	 * a Berlin ring 0.64% large north–south and 0.4% out of round, which is well
	 * outside the tenth of a percent asserted here.
	 */
	it("is round, at the radius asked for, at every latitude", () => {
		for (const center of [
			[9.44, 54.78] as LngLat, // Flensburg
			ALEX,
			[11.1, 47.49] as LngLat, // Garmisch
			[13.4, 0] as LngLat,
		]) {
			for (const radius of [50, 400, 5_000]) {
				const [polygon] = circleLngLat(center, radius);
				for (const point of polygon?.[0] ?? []) {
					const measured = distanceMeters(center, point);
					expect(Math.abs(measured - radius) / radius).toBeLessThan(0.001);
				}
			}
		}
	});

	it("is empty at a non-positive radius", () => {
		expect(circleLngLat(ALEX, 0)).toHaveLength(0);
	});
});

describe("regionArea", () => {
	/**
	 * Geodesic rather than planar. A shoelace over degrees would call the Berlin
	 * disc 40% smaller than the equatorial one, because a square degree is a
	 * different amount of ground at each — and M13 reports a percentage.
	 *
	 * The residual 1% is the honest limit of the spherical-excess formula: it
	 * uses one mean radius, and the ellipsoid's local radius varies from about
	 * 6357 km at the equator to 6400 km at the pole. M13's number is a ratio of
	 * two areas at the same latitude, where that cancels exactly.
	 */
	it("gives near enough the same ground area for the same radius at any latitude", () => {
		const berlin = regionArea(circleRegion(ALEX, 3_000));
		const equator = regionArea(circleRegion([13.4, 0], 3_000));
		expect(Math.abs(berlin / equator - 1)).toBeLessThan(0.01);
	});

	it("is within the 64-gon's deficit of the true disc", () => {
		const area = regionArea(circleRegion(ALEX, 2_000));
		expect(area / (Math.PI * 2_000 * 2_000)).toBeGreaterThan(0.99);
		expect(area / (Math.PI * 2_000 * 2_000)).toBeLessThanOrEqual(1);
	});
});

describe("multiPolygonBBox", () => {
	const square: MultiPolygon = [
		[
			[
				[13.3, 52.4],
				[13.5, 52.4],
				[13.5, 52.6],
				[13.3, 52.6],
				[13.3, 52.4],
			],
		],
	];

	it("spans every outer ring", () => {
		expect(multiPolygonBBox(square)).toEqual([13.3, 52.4, 13.5, 52.6]);
	});

	it("is null for a geometry with nothing in it", () => {
		expect(multiPolygonBBox([])).toBeNull();
	});
});
