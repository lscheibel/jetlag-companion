import { describe, expect, it } from "vitest";
import {
	clampZoneMeters,
	HIDING_ZONE_MAX_M,
	HIDING_ZONE_MIN_M,
	parseZoneMeters,
} from "./game-size";

describe("parseZoneMeters", () => {
	it("reads a metre figure", () => {
		expect(parseZoneMeters("750")).toBe(750);
		expect(parseZoneMeters("750 m")).toBe(750);
		expect(parseZoneMeters("1,200")).toBe(1_200);
	});

	it("reads kilometres", () => {
		expect(parseZoneMeters("1.5 km")).toBe(1_500);
	});

	it("rejects empty or unreadable input", () => {
		expect(parseZoneMeters("")).toBeNull();
		expect(parseZoneMeters("  ")).toBeNull();
		expect(parseZoneMeters("wide")).toBeNull();
		expect(parseZoneMeters("0")).toBeNull();
		expect(parseZoneMeters("-100")).toBeNull();
	});
});

describe("clampZoneMeters", () => {
	it("keeps a custom figure inside the hiding-zone range", () => {
		expect(clampZoneMeters(750)).toBe(750);
		expect(clampZoneMeters(50)).toBe(HIDING_ZONE_MIN_M);
		expect(clampZoneMeters(80_000)).toBe(HIDING_ZONE_MAX_M);
	});
});
