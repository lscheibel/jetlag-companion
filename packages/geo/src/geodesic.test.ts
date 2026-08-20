import { describe, expect, it } from "vitest";
import { distanceMeters, metersPerDegree } from "./geodesic";
import { circleLngLat } from "./region";
import type { LngLat } from "./types";

describe("distanceMeters", () => {
	it("matches the WGS84 equatorial degree reference", () => {
		expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111_319.4908, 3);
	});

	it("matches the published Flinders Peak to Buninyong Vincenty example", () => {
		const flindersPeak: LngLat = [144.424867889, -37.951033417];
		const buninyong: LngLat = [143.926495528, -37.652821139];
		expect(distanceMeters(flindersPeak, buninyong)).toBeCloseTo(54_972.271, 3);
	});

	it("returns zero for coincident points", () => {
		expect(distanceMeters([13.4, 52.5], [13.4, 52.5])).toBe(0);
	});
});

describe("WGS84 circle construction", () => {
	it.each([
		["Flensburg", 54.7937],
		["Berlin", 52.52],
		["Garmisch", 47.4917],
	])("stays within a tenth percent at %s", (_name, lat) => {
		const center: LngLat = [11, lat];
		const radius = 2_000;
		const ring = circleLngLat(center, radius)[0]?.[0] ?? [];
		for (const point of ring.slice(0, -1)) {
			expect(
				Math.abs(distanceMeters(center, point) - radius) / radius,
			).toBeLessThan(0.001);
		}
	});

	it("uses latitude-dependent degree scales", () => {
		expect(metersPerDegree(52.52).lat).toBeGreaterThan(metersPerDegree(0).lat);
		expect(metersPerDegree(52.52).lng).toBeLessThan(metersPerDegree(0).lng);
	});
});
