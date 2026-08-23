import { regionArea, ringAreaMeters } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { boundaryLabel } from "./admin-level";
import { parseBoundaryLine } from "./boundary";

/**
 * Every line below was written by osmium 1.15.0 running the exact command in
 * `infra/osm/extract-boundaries.sh` over a hand-built .osm fixture. They are
 * transcribed, not imagined — see m4-spec §4 for why that distinction earns its
 * keep in this project.
 */
const BEZIRK =
	'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.3,52.5],[13.4,52.5],[13.4,52.55],[13.3,52.55],[13.3,52.5]]]]},"properties":{"@type":"relation","@id":100,"boundary":"administrative","admin_level":"9","name":"Testbezirk","name:prefix":"Bezirk","de:regionalschluessel":"11012"}}';

const HOLE_AND_EXCLAVE =
	'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.3,52.5],[13.4,52.5],[13.4,52.55],[13.3,52.55],[13.3,52.5]],[[13.32,52.51],[13.32,52.53],[13.34,52.53],[13.34,52.51],[13.32,52.51]]],[[[13.6,52.6],[13.65,52.6],[13.65,52.63],[13.6,52.63],[13.6,52.6]]]]},"properties":{"@type":"relation","@id":200,"boundary":"administrative","admin_level":"8","name":"Gemeinde mit Exklave und Loch","de:amtlicher_gemeindeschluessel":"12345678"}}';

const NO_KEY =
	'{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[13.3,52.5],[13.4,52.5],[13.4,52.55],[13.3,52.55],[13.3,52.5]]]]},"properties":{"@type":"relation","@id":201,"boundary":"administrative","admin_level":"6","name":"Landkreis ohne Schlüssel"}}';

/** The admin_centre node of a boundary relation, as osmium exports it. */
const ADMIN_CENTRE_NODE =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.35,52.52]},"properties":{"@type":"node","@id":5,"name":"Testort"}}';

function expectOk(line: string) {
	const result = parseBoundaryLine(line);
	if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
	return result.boundary;
}

describe("parseBoundaryLine", () => {
	it("reads a Bezirk relation", () => {
		const b = expectOk(BEZIRK);
		expect(b.osmType).toBe("relation");
		expect(b.osmId).toBe(100);
		expect(b.name).toBe("Testbezirk");
		expect(b.adminLevel).toBe(9);
		expect(b.labelPrefix).toBe("Bezirk");
		expect(b.officialKey).toBe("11012");
		expect(b.region.polygons).toHaveLength(1);
	});

	it("keeps a hole inside its outer ring and an exclave as its own polygon", () => {
		const b = expectOk(HOLE_AND_EXCLAVE);
		expect(b.region.polygons).toHaveLength(2);
		// polygon 0 is outer + hole, polygon 1 is the exclave
		expect(b.region.polygons[0]).toHaveLength(2);
		expect(b.region.polygons[1]).toHaveLength(1);
	});

	/**
	 * The nesting above is only meaningful if `@zero-lag/geo` reads it the same
	 * way: index 0 outer, the rest holes. Flatten the exclave into the first
	 * polygon and this number moves.
	 */
	it("subtracts the hole and adds the exclave when measured", () => {
		const b = expectOk(HOLE_AND_EXCLAVE);
		const [main, exclave] = b.region.polygons;
		if (!main?.[0] || !main[1] || !exclave?.[0]) throw new Error("bad fixture");
		const expected =
			Math.abs(ringAreaMeters(main[0])) -
			Math.abs(ringAreaMeters(main[1])) +
			Math.abs(ringAreaMeters(exclave[0]));
		expect(regionArea(b.region)).toBeCloseTo(expected, 0);
	});

	it("prefers the Regionalschlüssel, falls back to the Gemeindeschlüssel", () => {
		expect(expectOk(BEZIRK).officialKey).toBe("11012");
		expect(expectOk(HOLE_AND_EXCLAVE).officialKey).toBe("12345678");
		expect(expectOk(NO_KEY).officialKey).toBeNull();
	});

	it("skips the admin_centre node rather than treating it as a tiny boundary", () => {
		const result = parseBoundaryLine(ADMIN_CENTRE_NODE);
		expect(result).toEqual({ ok: false, reason: "not-an-area", osmId: 5 });
	});

	it.each([
		["not json at all", "malformed-json"],
		['{"type":"FeatureCollection","features":[]}', "not-a-feature"],
	])("rejects %s", (line, reason) => {
		const result = parseBoundaryLine(line);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe(reason);
	});

	it.each([
		["8;9", "missing-admin-level"],
		["", "missing-admin-level"],
		[" 10 ", undefined],
		["99", "admin-level-out-of-range"],
	])("handles admin_level %j", (level, reason) => {
		const line = BEZIRK.replace(
			'"admin_level":"9"',
			`"admin_level":"${level}"`,
		);
		const result = parseBoundaryLine(line);
		if (reason === undefined) {
			expect(result.ok).toBe(true);
		} else if (result.ok) {
			throw new Error("expected a skip");
		} else {
			expect(result.reason).toBe(reason);
		}
	});

	it("requires a name", () => {
		const line = BEZIRK.replace('"name":"Testbezirk",', "");
		const result = parseBoundaryLine(line);
		expect(result).toEqual({
			ok: false,
			reason: "missing-name",
			osmId: 100,
		});
	});
});

describe("boundaryLabel", () => {
	it("uses OSM's own prefix when it has one", () => {
		expect(boundaryLabel(9, "Bezirk")).toBe("Bezirk");
	});

	it("falls back to the level's usual German term", () => {
		expect(boundaryLabel(9, null)).toBe("Stadtbezirk");
		expect(boundaryLabel(8, null)).toBe("Gemeinde");
	});

	it("names an unmapped level rather than inventing one", () => {
		expect(boundaryLabel(3, null)).toBe("Ebene 3");
	});
});
