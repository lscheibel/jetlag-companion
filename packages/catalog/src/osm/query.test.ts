import { describe, expect, it } from "vitest";
import { BERLIN_FIXTURE_BOUNDARIES } from "./fixture";
import {
	boundariesFromGeojsonseq,
	boundariesInBBox,
	boundariesMatching,
	boundaryContaining,
} from "./query";

/** Alexanderplatz, inside the starter map and inside Mitte at both levels. */
const ALEX = [13.4132, 52.5219] as const;
/** The starter map's box: [13.29,52.46]–[13.51,52.57]. */
const STARTER = [13.29, 52.46, 13.51, 52.57] as const;

const BEZIRK_LINE =
	'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.3,52.5],[13.4,52.5],[13.4,52.55],[13.3,52.55],[13.3,52.5]]]]},"properties":{"@type":"relation","@id":100,"boundary":"administrative","admin_level":"9","name":"Testbezirk","name:prefix":"Bezirk","de:regionalschluessel":"11012"}}';

describe("boundariesInBBox", () => {
	it("keeps Bezirke that overlap the starter map and drops Spandau", () => {
		const found = boundariesInBBox(BERLIN_FIXTURE_BOUNDARIES, STARTER, 9);
		const names = found.map((row) => row.name);
		expect(names).toContain("Mitte");
		expect(names).toContain("Friedrichshain-Kreuzberg");
		expect(names).not.toContain("Spandau");
	});

	it("lists Berlin the Land at admin 4", () => {
		const found = boundariesInBBox(BERLIN_FIXTURE_BOUNDARIES, STARTER, 4);
		expect(found.map((row) => row.name)).toEqual(["Berlin"]);
	});

	it("lists Ortsteile separately from Bezirke", () => {
		const found = boundariesInBBox(BERLIN_FIXTURE_BOUNDARIES, STARTER, 10);
		expect(found.map((row) => row.name)).toContain("Prenzlauer Berg");
		expect(found.every((row) => row.adminLevel === 10)).toBe(true);
	});
});

describe("boundaryContaining", () => {
	it("places Alexanderplatz in Bezirk Mitte", () => {
		const hit = boundaryContaining(BERLIN_FIXTURE_BOUNDARIES, ALEX, 9);
		expect(hit?.id).toBe("relation/90001");
		expect(hit?.name).toBe("Mitte");
		expect(hit?.adminLevel).toBe(9);
	});

	it("places Alexanderplatz in Ortsteil Mitte, not Prenzlauer Berg", () => {
		const hit = boundaryContaining(BERLIN_FIXTURE_BOUNDARIES, ALEX, 10);
		expect(hit?.id).toBe("relation/10001");
		expect(hit?.name).toBe("Mitte");
	});
});

describe("boundariesMatching", () => {
	it("lists every Land without a bbox, including ones outside Berlin", () => {
		const found = boundariesMatching(BERLIN_FIXTURE_BOUNDARIES, 4, "");
		expect(found.matches.map((row) => row.name)).toEqual(["Berlin", "Hamburg"]);
		expect(found.total).toBe(2);
		expect(
			boundariesInBBox(BERLIN_FIXTURE_BOUNDARIES, STARTER, 4).map(
				(row) => row.name,
			),
		).toEqual(["Berlin"]);
	});

	it("finds a Bezirk by name even when it sits outside a Berlin bbox", () => {
		const found = boundariesMatching(BERLIN_FIXTURE_BOUNDARIES, 9, "span");
		expect(found.matches.map((row) => row.name)).toEqual(["Spandau"]);
		expect(
			boundariesInBBox(BERLIN_FIXTURE_BOUNDARIES, STARTER, 9).map(
				(row) => row.name,
			),
		).not.toContain("Spandau");
	});

	it("ranks a token prefix ahead of a name that only contains the query", () => {
		const found = boundariesMatching(BERLIN_FIXTURE_BOUNDARIES, 10, "berg");
		expect(found.matches.map((row) => row.name)).toEqual([
			"Prenzlauer Berg",
			"Kreuzberg",
		]);
	});

	it("caps the list and still reports how many matched", () => {
		const found = boundariesMatching(BERLIN_FIXTURE_BOUNDARIES, 9, "", 2);
		expect(found.matches).toHaveLength(2);
		expect(found.total).toBeGreaterThan(2);
	});

	it("narrows a name search to a bbox and can mix admin levels", () => {
		const found = boundariesMatching(
			BERLIN_FIXTURE_BOUNDARIES,
			[4, 9],
			"span",
			100,
			STARTER,
		);
		expect(found.matches.map((row) => row.name)).toEqual([]);
		const wide = boundariesMatching(BERLIN_FIXTURE_BOUNDARIES, [4, 9], "span");
		expect(wide.matches.map((row) => row.name)).toEqual(["Spandau"]);
	});
});

describe("boundariesFromGeojsonseq", () => {
	it("keeps admin_level 4, 9 and 10 and skips the rest", () => {
		const land =
			'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.0,52.3],[13.8,52.3],[13.8,52.7],[13.0,52.7],[13.0,52.3]]]]},"properties":{"@type":"relation","@id":4,"boundary":"administrative","admin_level":"4","name":"Berlin"}}';
		const gemeinde =
			'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.3,52.5],[13.4,52.5],[13.4,52.55],[13.3,52.55],[13.3,52.5]]]]},"properties":{"@type":"relation","@id":8,"boundary":"administrative","admin_level":"8","name":"A Gemeinde"}}';
		const rows = boundariesFromGeojsonseq(
			`${land}\n${BEZIRK_LINE}\n${gemeinde}`,
		);
		expect(rows.map((row) => row.name).sort()).toEqual([
			"Berlin",
			"Testbezirk",
		]);
	});
});
