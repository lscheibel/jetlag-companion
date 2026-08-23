import { distanceMeters } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { buildValidHidingArea } from "../map/area";
import { BERLIN_FIXTURE_CATALOG } from "./fixture";
import {
	expandBBox,
	materialiseStops,
	nearestStationMeters,
} from "./materialise";

const STOPS = BERLIN_FIXTURE_CATALOG.stops;

/** Mitte-ish: holds Alexanderplatz and Friedrichstraße, excludes the Ring. */
const MITTE = buildValidHidingArea([
	[13.38, 52.51],
	[13.42, 52.51],
	[13.42, 52.53],
	[13.38, 52.53],
]);

describe("expandBBox", () => {
	it("grows the box by the margin on the ground, not in degrees", () => {
		const box = expandBBox([13.4, 52.5, 13.4, 52.5], 1000);
		expect(distanceMeters([13.4, 52.5], [box[0], 52.5])).toBeCloseTo(1000, 0);
		expect(distanceMeters([13.4, 52.5], [13.4, box[1]])).toBeCloseTo(1000, 0);
	});
});

describe("materialiseStops", () => {
	it("carries stops outside the area, flagged as outside", () => {
		const stops = materialiseStops(STOPS, MITTE, 5000);
		const inside = stops.filter((s) => s.insideArea).map((s) => s.stopId);
		const outside = stops.filter((s) => !s.insideArea).map((s) => s.stopId);

		expect(inside).toEqual(["alexanderplatz", "friedrichstrasse"]);
		// A seeker changing at Hauptbahnhof must be able to find it. m4-spec §5.
		expect(outside).toContain("hauptbahnhof");
		expect(stops.length).toBeGreaterThan(inside.length);
	});

	it("widens the set as the margin grows and never narrows the inside set", () => {
		const tight = materialiseStops(STOPS, MITTE, 1000);
		const wide = materialiseStops(STOPS, MITTE, 20_000);
		expect(wide.length).toBeGreaterThan(tight.length);
		expect(wide.filter((s) => s.insideArea)).toEqual(
			tight.filter((s) => s.insideArea),
		);
	});

	/**
	 * The property §7's share code rests on: same polygon, same margin, same
	 * catalog gives the same rows in the same order, so two devices agree by
	 * construction rather than by luck.
	 */
	it("is a pure function of area, margin and catalog", () => {
		const a = materialiseStops(STOPS, MITTE, 5000);
		const b = materialiseStops([...STOPS].reverse(), MITTE, 5000);
		expect(b).toEqual(a);
		expect(a.map((s) => s.stopId)).toEqual([...a.map((s) => s.stopId)].sort());
	});

	it("is empty for an empty area", () => {
		expect(materialiseStops(STOPS, { polygons: [] }, 5000)).toEqual([]);
	});

	it("copies named lines onto the materialised row", () => {
		const alex = materialiseStops(STOPS, MITTE, 5000).find(
			(stop) => stop.stopId === "alexanderplatz",
		);
		expect(alex?.lines.some((line) => line.name === "U8")).toBe(true);
		expect(alex?.modeIds).toEqual(["u-bahn", "s-bahn", "bus"]);
	});
});

describe("nearestStationMeters", () => {
	it("measures to the closest station", () => {
		const alex = nearestStationMeters([13.4132, 52.5219], STOPS);
		expect(alex).toBeCloseTo(0, 0);
	});

	it("is infinite when a game carries no stops", () => {
		expect(nearestStationMeters([13.4, 52.5], [])).toBe(
			Number.POSITIVE_INFINITY,
		);
	});

	it("finds a spot far from any station in the fixture", () => {
		// Wannsee — well outside the twelve.
		expect(nearestStationMeters([13.18, 52.42], STOPS)).toBeGreaterThan(5000);
	});
});
