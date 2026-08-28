import { describe, expect, it } from "vitest";
import { parsePoiLine, poisFromGeojsonseq } from "./poi";
import { BERLIN_FIXTURE_POIS } from "./poi-fixture";
import { poiKindFromTags } from "./poi-kinds";
import { poisFromJson, poisInBBox } from "./poi-query";

/** The starter map's box: [13.29,52.46]–[13.51,52.57]. */
const STARTER = [13.29, 52.46, 13.51, 52.57] as const;

const MUSEUM_NODE =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.3969,52.5212]},"properties":{"@type":"node","@id":42,"tourism":"museum","name":"Pergamonmuseum"}}';

const CASTLE_POLYGON =
	'{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[13.4,52.51],[13.42,52.51],[13.42,52.53],[13.4,52.53],[13.4,52.51]]]},"properties":{"@type":"way","@id":88,"historic":"castle","name":"Berliner Schloss"}}';

const UNTAGGED_NODE =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.4,52.52]},"properties":{"@type":"node","@id":7,"name":"A vertex"}}';

const UNNAMED_HOSPITAL =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.38,52.52]},"properties":{"@type":"node","@id":9,"amenity":"hospital"}}';

const NAMED_PARK =
	'{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[13.35,52.51],[13.37,52.51],[13.37,52.52],[13.35,52.52],[13.35,52.51]]]},"properties":{"@type":"way","@id":13,"leisure":"park","name":"Großer Tiergarten"}}';

const UNNAMED_PARK =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.4,52.52]},"properties":{"@type":"node","@id":14,"leisure":"park"}}';

const PEAK_NODE =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.241,52.497]},"properties":{"@type":"node","@id":15,"natural":"peak","name":"Teufelsberg"}}';

const CONSULATE =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.372,52.508]},"properties":{"@type":"way","@id":16,"diplomatic":"consulate","name":"Generalkonsulat der Vereinigten Staaten"}}';

const HONORARY_CONSUL =
	'{"type":"Feature","geometry":{"type":"Point","coordinates":[13.4,52.52]},"properties":{"@type":"node","@id":17,"diplomatic":"consulate","consulate":"honorary_consul","name":"Honorarkonsul"}}';

function expectOk(line: string) {
	const result = parsePoiLine(line);
	if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
	return result.poi;
}

describe("poiKindFromTags", () => {
	it("matches the listed kinds and ignores everything else", () => {
		expect(poiKindFromTags({ tourism: "museum" })).toBe("museum");
		expect(poiKindFromTags({ amenity: "library" })).toBe("library");
		expect(poiKindFromTags({ historic: "castle" })).toBe("castle");
		expect(poiKindFromTags({ leisure: "water_park" })).toBe("water_park");
		expect(poiKindFromTags({ leisure: "park" })).toBe("park");
		expect(poiKindFromTags({ natural: "peak" })).toBe("mountain");
		expect(poiKindFromTags({ leisure: "golf_course" })).toBe("golf_course");
		expect(poiKindFromTags({ diplomatic: "consulate" })).toBe("consulate");
		expect(poiKindFromTags({ amenity: "cafe" })).toBeNull();
	});

	it("prefers the listed order when two tags are present", () => {
		expect(poiKindFromTags({ tourism: "museum", amenity: "library" })).toBe(
			"museum",
		);
	});
});

describe("parsePoiLine", () => {
	it("reads a tagged node", () => {
		const poi = expectOk(MUSEUM_NODE);
		expect(poi).toEqual({
			id: "node/42",
			name: "Pergamonmuseum",
			kind: "museum",
			lng: 13.3969,
			lat: 52.5212,
		});
	});

	it("places a polygon at the outer-ring bbox centre", () => {
		const poi = expectOk(CASTLE_POLYGON);
		expect(poi.id).toBe("way/88");
		expect(poi.kind).toBe("castle");
		expect(poi.lng).toBeCloseTo(13.41);
		expect(poi.lat).toBeCloseTo(52.52);
	});

	it("skips untagged member nodes", () => {
		expect(parsePoiLine(UNTAGGED_NODE)).toEqual({
			ok: false,
			reason: "unknown-kind",
			osmId: 7,
		});
	});

	it("falls back to the kind name when OSM has no name", () => {
		expect(expectOk(UNNAMED_HOSPITAL).name).toBe("Hospital");
	});

	it("keeps a named park and a peak", () => {
		expect(expectOk(NAMED_PARK)).toMatchObject({
			id: "way/13",
			kind: "park",
			name: "Großer Tiergarten",
		});
		expect(expectOk(PEAK_NODE)).toMatchObject({
			kind: "mountain",
			name: "Teufelsberg",
		});
		expect(expectOk(CONSULATE).kind).toBe("consulate");
	});

	it("drops unnamed parks after the osmium candidate extract", () => {
		expect(parsePoiLine(UNNAMED_PARK)).toEqual({
			ok: false,
			reason: "missing-name",
			osmId: 14,
		});
	});

	it("drops honorary consuls after the osmium candidate extract", () => {
		expect(parsePoiLine(HONORARY_CONSUL)).toEqual({
			ok: false,
			reason: "honorary-consul",
			osmId: 17,
		});
	});

	it.each([
		["not json at all", "malformed-json", null],
		['{"type":"FeatureCollection","features":[]}', "not-a-feature", null],
	])("rejects %s", (line, reason, osmId) => {
		const result = parsePoiLine(line);
		expect(result).toEqual({ ok: false, reason, osmId });
	});
});

describe("poisFromGeojsonseq", () => {
	it("keeps tagged features and drops the rest", () => {
		const rows = poisFromGeojsonseq(
			[MUSEUM_NODE, UNTAGGED_NODE, CASTLE_POLYGON, ""].join("\n"),
		);
		expect(rows.map((row) => row.id)).toEqual(["node/42", "way/88"]);
	});
});

describe("poisInBBox", () => {
	it("keeps places inside the starter map and drops Olympiastadion", () => {
		const found = poisInBBox(BERLIN_FIXTURE_POIS, STARTER);
		const names = found.map((row) => row.name);
		expect(names).toContain("Pergamonmuseum");
		expect(names).toContain("Zoo Berlin");
		expect(names).toContain("Tierpark Berlin");
		expect(names).toContain("Großer Tiergarten");
		expect(names).not.toContain("Olympiastadion");
		expect(names).not.toContain("Teufelsberg");
	});
});

describe("poisFromJson", () => {
	it("reads a { pois } catalog and a bare array", () => {
		const wrapped = poisFromJson({ pois: BERLIN_FIXTURE_POIS });
		const bare = poisFromJson([...BERLIN_FIXTURE_POIS]);
		expect(wrapped).toHaveLength(BERLIN_FIXTURE_POIS.length);
		expect(bare).toHaveLength(BERLIN_FIXTURE_POIS.length);
		expect(wrapped?.[0]?.id).toBe("way/1001");
	});

	it("returns null for junk", () => {
		expect(poisFromJson({ stops: [] })).toBeNull();
		expect(poisFromJson("nope")).toBeNull();
	});
});
