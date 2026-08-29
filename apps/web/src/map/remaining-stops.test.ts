import { BERLIN_FIXTURE_CATALOG } from "@zero-lag/catalog";
import { circleRegion } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { remainingStopCount, stopInNarrowedArea } from "./remaining-stops";
import type { SearchableStop } from "./toolkit";

const STOPS: SearchableStop[] = BERLIN_FIXTURE_CATALOG.stops.map((stop) => ({
	stopId: stop.id,
	name: stop.name,
	lng: stop.lng,
	lat: stop.lat,
	modeIds: stop.modeIds,
	lines: stop.lines,
	insideArea: stop.id !== "westkreuz",
}));

const ALEX = STOPS.find((stop) => stop.stopId === "alexanderplatz");
const WESTKREUZ = STOPS.find((stop) => stop.stopId === "westkreuz");

describe("stopInNarrowedArea", () => {
	it("treats every in-area stop as remaining when there is no fold yet", () => {
		expect(ALEX && stopInNarrowedArea(ALEX, null)).toBe(true);
	});

	it("never keeps a stop outside the game area, even under a covering fold", () => {
		if (!WESTKREUZ) throw new Error("fixture is missing Westkreuz");
		const covering = circleRegion([WESTKREUZ.lng, WESTKREUZ.lat], 2_000);
		expect(stopInNarrowedArea(WESTKREUZ, covering)).toBe(false);
		expect(stopInNarrowedArea(WESTKREUZ, null)).toBe(false);
	});
});

describe("remainingStopCount", () => {
	it("counts every in-area stop when the fold has not cut yet", () => {
		expect(remainingStopCount(STOPS, null)).toBe(
			STOPS.filter((stop) => stop.insideArea).length,
		);
	});

	it("counts only stations still inside the surviving fold", () => {
		if (!ALEX) throw new Error("fixture is missing Alexanderplatz");
		const aroundAlex = circleRegion([ALEX.lng, ALEX.lat], 400);
		expect(remainingStopCount(STOPS, aroundAlex)).toBe(1);
	});
});
