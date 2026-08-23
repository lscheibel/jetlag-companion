import { describe, expect, it } from "vitest";
import { BERLIN_FIXTURE_BOUNDARIES } from "./fixture";
import {
	boundariesFromGeojsonseq,
	boundariesInBBox,
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

describe("boundariesFromGeojsonseq", () => {
	it("keeps admin_level 9 and skips anything else", () => {
		const rows = boundariesFromGeojsonseq(BEZIRK_LINE);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe("Testbezirk");
		expect(rows[0]?.adminLevel).toBe(9);
		expect(rows[0]?.id).toBe("relation/100");
	});
});
