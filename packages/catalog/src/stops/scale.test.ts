import { multiPolygonBBox, regionToMultiPolygon } from "@zero-lag/geo";
import { SCALE_PRESETS } from "@zero-lag/schema";
import { describe, expect, it } from "vitest";
import { buildValidHidingArea } from "../map/area";
import { SCALE_SETTINGS, spanMeters, suggestScalePreset } from "./scale";

function bboxOf(...ring: [number, number][]) {
	const bbox = multiPolygonBBox(
		regionToMultiPolygon(buildValidHidingArea(ring)),
	);
	if (!bbox) throw new Error("empty");
	return bbox;
}

describe("SCALE_SETTINGS", () => {
	it("covers every preset", () => {
		expect(Object.keys(SCALE_SETTINGS).sort()).toEqual(
			[...SCALE_PRESETS].sort(),
		);
	});

	it("grows monotonically, so a wider game never gets a tighter margin", () => {
		const margins = SCALE_PRESETS.map((p) => SCALE_SETTINGS[p].marginMeters);
		const radii = SCALE_PRESETS.map(
			(p) => SCALE_SETTINGS[p].hidingRadiusMeters,
		);
		expect(margins).toEqual([...margins].sort((a, b) => a - b));
		expect(radii).toEqual([...radii].sort((a, b) => a - b));
	});
});

describe("suggestScalePreset", () => {
	it("reads a Bezirk-sized draw as a district", () => {
		// Roughly Friedrichshain-Kreuzberg.
		expect(
			suggestScalePreset(
				bboxOf([13.38, 52.49], [13.47, 52.49], [13.47, 52.53], [13.38, 52.53]),
			),
		).toBe("district");
	});

	it("reads a city-sized draw as a city", () => {
		// Roughly the Berlin city limits.
		expect(
			suggestScalePreset(
				bboxOf([13.09, 52.34], [13.76, 52.34], [13.76, 52.68], [13.09, 52.68]),
			),
		).toBe("city");
	});

	it("reads a nationwide draw as ticket scale", () => {
		expect(
			suggestScalePreset(
				bboxOf([5.9, 47.3], [15.0, 47.3], [15.0, 55.1], [5.9, 55.1]),
			),
		).toBe("ticket");
	});

	/**
	 * The preset must come from the area's own extent, never from an
	 * administrative level: Berlin's Bezirke are level 9 and Hamburg's too,
	 * while elsewhere level 9 is a Stadtbezirk of a level-8 Gemeinde. m4-spec §4.
	 */
	it("gives a Bezirk and a same-sized drawn blob the same preset", () => {
		const bezirk = bboxOf(
			[13.38, 52.49],
			[13.47, 52.49],
			[13.47, 52.53],
			[13.38, 52.53],
		);
		const blob = bboxOf(
			[13.1, 52.6],
			[13.19, 52.6],
			[13.19, 52.64],
			[13.1, 52.64],
		);
		expect(suggestScalePreset(blob)).toBe(suggestScalePreset(bezirk));
	});

	it("measures the diagonal, so a long thin area is not read as small", () => {
		const line = bboxOf(
			[13.0, 52.4],
			[13.8, 52.4],
			[13.8, 52.41],
			[13.0, 52.41],
		);
		expect(spanMeters(line)).toBeGreaterThan(50_000);
	});
});
