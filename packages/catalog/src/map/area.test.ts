import { regionArea, regionContains } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { buildValidHidingArea, closeRing } from "./area";

/** A 0.1° × 0.05° box over central Berlin — a plausible district-sized draw. */
const SQUARE = [
	[13.34, 52.5],
	[13.44, 52.5],
	[13.44, 52.55],
	[13.34, 52.55],
] as const;

describe("buildValidHidingArea", () => {
	it("closes a ring the host left open", () => {
		const area = buildValidHidingArea(SQUARE);
		expect(area.polygons).toHaveLength(1);
		expect(regionContains(area, [13.39, 52.52])).toBe(true);
		expect(regionContains(area, [13.3, 52.52])).toBe(false);
	});

	/**
	 * The bowtie. Tapping the corners in crossing order gives a ring that is not
	 * a polygon; the self-union resolves it into the two lobes actually drawn,
	 * which together are exactly half the square. m4-spec §3.
	 */
	it("repairs a self-intersecting ring into two lobes of half the area", () => {
		const square = buildValidHidingArea(SQUARE);
		const bowtie = buildValidHidingArea([
			[13.34, 52.5],
			[13.44, 52.5],
			[13.34, 52.55],
			[13.44, 52.55],
		]);

		expect(bowtie.polygons).toHaveLength(2);
		expect(regionArea(bowtie)).toBeCloseTo(regionArea(square) / 2, -3);
	});

	it("is empty for a ring with no interior", () => {
		expect(buildValidHidingArea([]).polygons).toHaveLength(0);
		expect(
			buildValidHidingArea([
				[13.34, 52.5],
				[13.44, 52.5],
			]).polygons,
		).toHaveLength(0);
	});
});

describe("closeRing", () => {
	it("leaves an already-closed ring alone", () => {
		const closed = [...SQUARE, SQUARE[0]];
		expect(closeRing(closed)).toBe(closed);
	});

	it("repeats the first vertex when the host stopped short", () => {
		expect(closeRing(SQUARE)).toHaveLength(SQUARE.length + 1);
	});
});
