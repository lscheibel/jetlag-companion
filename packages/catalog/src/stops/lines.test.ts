import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BERLIN_FIXTURE_CATALOG } from "./fixture";
import { compareLineNames, groupLinesByMode, modeIdsFromLines } from "./lines";
import type { StopCatalog } from "./types";

describe("modeIdsFromLines", () => {
	it("follows MODE_IDS order, not the feed's", () => {
		expect(
			modeIdsFromLines([
				{ name: "100", modeId: "bus" },
				{ name: "U8", modeId: "u-bahn" },
				{ name: "S1", modeId: "s-bahn" },
			]),
		).toEqual(["u-bahn", "s-bahn", "bus"]);
	});
});

describe("compareLineNames", () => {
	it("puts U2 before U8 before U10", () => {
		expect(["U10", "U2", "U8"].sort(compareLineNames)).toEqual([
			"U2",
			"U8",
			"U10",
		]);
	});
});

describe("groupLinesByMode", () => {
	it("skips empty groups and sorts names inside a mode", () => {
		const groups = groupLinesByMode([
			{ name: "U8", modeId: "u-bahn" },
			{ name: "U2", modeId: "u-bahn" },
			{ name: "100", modeId: "bus" },
		]);
		expect(groups).toEqual([
			{ modeId: "u-bahn", names: ["U2", "U8"] },
			{ modeId: "bus", names: ["100"] },
		]);
	});
});

describe("the Berlin fixture", () => {
	it("puts U8 on Alexanderplatz", () => {
		const alex = BERLIN_FIXTURE_CATALOG.stops.find(
			(stop) => stop.id === "alexanderplatz",
		);
		expect(
			alex?.lines.some(
				(line) => line.name === "U8" && line.modeId === "u-bahn",
			),
		).toBe(true);
	});
});

const CATALOG_PATH = [
	"assets/catalog/stops.catalog.json",
	"../../assets/catalog/stops.catalog.json",
].find((path) => existsSync(path));

function loadBuiltCatalog(path: string): StopCatalog | null {
	const catalog = JSON.parse(readFileSync(path, "utf8")) as StopCatalog;
	// An artifact from before named lines were kept has no `lines` field.
	if (!catalog.stops.some((stop) => Array.isArray(stop.lines))) return null;
	return catalog;
}

const BUILT_CATALOG = CATALOG_PATH ? loadBuiltCatalog(CATALOG_PATH) : null;

describe.skipIf(!BUILT_CATALOG)("against the built catalog", () => {
	it("puts U8 on a Berlin U-Bahn station", () => {
		expect(BUILT_CATALOG).toBeDefined();
		if (!BUILT_CATALOG) return;
		const withU8 = BUILT_CATALOG.stops.filter((stop) =>
			stop.lines.some((line) => line.name === "U8" && line.modeId === "u-bahn"),
		);
		expect(withU8.length).toBeGreaterThan(0);
	});
});
