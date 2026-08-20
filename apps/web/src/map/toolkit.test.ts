import { BERLIN_VBB_PACK } from "@zero-lag/area-packs";
import { describe, expect, it } from "vitest";
import {
	formatCoordinates,
	formatDistance,
	parseCoordinates,
	searchAreaPack,
} from "./toolkit";

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

describe("area-pack search", () => {
	const origin = [13.4, 52.52] as const;

	it("folds German transliterations", () => {
		const result = searchAreaPack(BERLIN_VBB_PACK, "suedkreuz", origin)[0];
		expect(result?.kind).toBe("stop");
		if (result?.kind === "stop") expect(result.stop.name).toBe("Südkreuz");
		const unmarked = searchAreaPack(BERLIN_VBB_PACK, "sudkreuz", origin)[0];
		expect(unmarked?.kind).toBe("stop");
		if (unmarked?.kind === "stop") expect(unmarked.stop.name).toBe("Südkreuz");
	});

	it("expands common aliases", () => {
		const result = searchAreaPack(BERLIN_VBB_PACK, "hbf", origin)[0];
		expect(result?.kind).toBe("stop");
		if (result?.kind === "stop") expect(result.stop.name).toBe("Hauptbahnhof");
	});

	it("ranks prefix matches before substrings", () => {
		const results = searchAreaPack(BERLIN_VBB_PACK, "ost", origin);
		expect(results[0]?.kind).toBe("stop");
		if (results[0]?.kind === "stop") {
			expect(results[0].stop.name).toBe("Ostkreuz");
		}
	});
});
