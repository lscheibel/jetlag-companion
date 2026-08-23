import { BERLIN_FIXTURE_CATALOG } from "@zero-lag/catalog";
import { describe, expect, it } from "vitest";
import {
	formatCoordinates,
	formatDistance,
	nearestStopPx,
	parseCoordinates,
	type SearchableStop,
	searchStops,
} from "./toolkit";

/**
 * The twelve-station fixture as a game would carry it. Everything is inside the
 * area except Westkreuz, which is here to prove that a stop outside the area is
 * still findable — a seeker changing there needs it. m4-spec §5.
 */
const STOPS: SearchableStop[] = BERLIN_FIXTURE_CATALOG.stops.map((stop) => ({
	stopId: stop.id,
	name: stop.name,
	lng: stop.lng,
	lat: stop.lat,
	modeIds: stop.modeIds,
	lines: stop.lines,
	insideArea: stop.id !== "westkreuz",
}));

describe("distance formatting", () => {
	it.each([
		[0, "0 m"],
		[846.6, "847 m"],
		[999.9, "1000 m"],
		[1_000, "1.00 km"],
		[1_400, "1.40 km"],
		[100_000, "100.00 km"],
		[100_500, "101 km"],
	])("formats %s metres", (meters, expected) => {
		expect(formatDistance(meters)).toBe(expected);
	});
});

describe("coordinates", () => {
	it("round trips the public lat-first format", () => {
		const point = [13.4132, 52.5219] as const;
		expect(parseCoordinates(formatCoordinates(point))).toEqual({
			point,
			swapped: false,
		});
	});

	it("accepts lng-first only when the first value cannot be latitude", () => {
		expect(parseCoordinates("120.25 -33.5")).toEqual({
			point: [120.25, -33.5],
			swapped: true,
		});
	});

	it("rejects out-of-range pairs", () => {
		expect(parseCoordinates("52, 181")).toBeNull();
		expect(parseCoordinates("181, 92")).toBeNull();
	});
});

describe("place search", () => {
	const origin = [13.4, 52.52] as const;

	function firstName(query: string): string | undefined {
		const result = searchStops(STOPS, query, origin)[0];
		return result?.kind === "stop" ? result.stop.name : undefined;
	}

	it("folds German transliterations", () => {
		expect(firstName("suedkreuz")).toBe("Südkreuz");
		expect(firstName("sudkreuz")).toBe("Südkreuz");
	});

	it("expands common aliases", () => {
		expect(firstName("hbf")).toBe("Hauptbahnhof");
	});

	it("ranks prefix matches before substrings", () => {
		expect(firstName("ost")).toBe("Ostkreuz");
	});

	/** m4-spec §5: seekers travel outside the area constantly. */
	it("finds a stop outside the game area", () => {
		const result = searchStops(STOPS, "westkreuz", origin)[0];
		expect(result?.kind).toBe("stop");
		if (result?.kind === "stop") expect(result.stop.insideArea).toBe(false);
	});

	it("still reads a coordinate pair rather than searching for it", () => {
		const result = searchStops(STOPS, "52.52, 13.4", origin)[0];
		expect(result?.kind).toBe("coordinate");
	});
});

describe("nearestStopPx", () => {
	const project = (lngLat: readonly [number, number]) => ({
		x: lngLat[0] * 1000,
		y: lngLat[1] * 1000,
	});

	it("hits a station within the pixel slop", () => {
		const alex = STOPS.find((stop) => stop.stopId === "alexanderplatz");
		expect(alex).toBeDefined();
		if (!alex) return;
		const screen = project([alex.lng, alex.lat]);
		expect(nearestStopPx(STOPS, screen, project)?.stopId).toBe(
			"alexanderplatz",
		);
	});

	it("misses when the tap is far from every stop", () => {
		expect(nearestStopPx(STOPS, { x: 0, y: 0 }, project)).toBeNull();
	});
});
