import { BERLIN_FIXTURE_CATALOG } from "@zero-lag/catalog";
import { describe, expect, it } from "vitest";
import {
	type ConstraintListItem,
	canMeasureToYou,
	constraintEditTool,
	distanceFromYou,
	formatCoordinates,
	formatDistance,
	nearestAtPx,
	nearestStopPx,
	type ParsedCoordinates,
	parseCoordinates,
	parsePastedCoordinates,
	radiusConstraintReady,
	type SearchableStop,
	searchStops,
} from "./toolkit";

/**
 * The twelve-station fixture as a game would carry it. Everything is inside the
 * area except Westkreuz, which is here to prove that a stop outside the area is
 * still findable — a seeker changing there needs it. m4-spec §5.
 */
const STOPS: SearchableStop[] = BERLIN_FIXTURE_CATALOG.stops.map((stop) => ({
	stopId: stop.id,
	name: stop.name,
	lng: stop.lng,
	lat: stop.lat,
	modeIds: stop.modeIds,
	lines: stop.lines,
	insideArea: stop.id !== "westkreuz",
}));

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

	it("omits distance when there is no GPS fix", () => {
		expect(distanceFromYou(null, 13.4, 52.52)).toBeNull();
	});

	it("formats the distance from a GPS origin", () => {
		expect(distanceFromYou([13.4, 52.52], 13.4, 52.52)).toBe("0 m");
	});
});

describe("canMeasureToYou", () => {
	const you = [13.4132, 52.5219] as const;

	it("needs a vertex and a GPS fix that is not already the last vertex", () => {
		expect(canMeasureToYou([], you)).toBe(false);
		expect(canMeasureToYou([[13.4, 52.5]], null)).toBe(false);
		expect(canMeasureToYou([you], you)).toBe(false);
		expect(canMeasureToYou([[13.4, 52.5], you], you)).toBe(false);
	});

	it("is true once the path has a last vertex that is not you", () => {
		expect(canMeasureToYou([[13.4, 52.5]], you)).toBe(true);
		expect(canMeasureToYou([you, [13.4, 52.5]], you)).toBe(true);
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

describe("pasted coordinates", () => {
	const berlin: ParsedCoordinates = {
		point: [13.405, 52.52],
		swapped: false,
	};

	it("reads a semicolon pair", () => {
		expect(parsePastedCoordinates("52.52; 13.405")).toEqual(berlin);
	});

	it("reads a JSON array lat-first", () => {
		expect(parsePastedCoordinates("[52.52, 13.405]")).toEqual(berlin);
	});

	it("reads named JSON keys, including lon and latitude", () => {
		expect(
			parsePastedCoordinates('{"latitude": 52.52, "longitude": 13.405}'),
		).toEqual(berlin);
		expect(parsePastedCoordinates('{"lat": 52.52, "lon": 13.405}')).toEqual(
			berlin,
		);
	});

	it("reads GeoJSON coordinates as lng-lat", () => {
		expect(
			parsePastedCoordinates('{"type":"Point","coordinates":[13.405, 52.52]}'),
		).toEqual({ point: [13.405, 52.52], swapped: true });
	});

	it("reads lat: lng: prose", () => {
		expect(parsePastedCoordinates("lat: 52.52, lng: 13.405")).toEqual(berlin);
	});

	it("reads a LatLng() call", () => {
		expect(parsePastedCoordinates("LatLng(52.52, 13.405)")).toEqual({
			point: [13.405, 52.52],
			swapped: false,
		});
	});
});

describe("place search", () => {
	const origin = [13.4, 52.52] as const;

	function firstName(query: string): string | undefined {
		const result = searchStops(STOPS, query, origin)[0];
		return result?.kind === "stop" ? result.stop.name : undefined;
	}

	it("folds German transliterations", () => {
		expect(firstName("suedkreuz")).toBe("Südkreuz");
		expect(firstName("sudkreuz")).toBe("Südkreuz");
	});

	it("expands common aliases", () => {
		expect(firstName("hbf")).toBe("Hauptbahnhof");
	});

	it("ranks prefix matches before substrings", () => {
		expect(firstName("ost")).toBe("Ostkreuz");
	});

	/** m4-spec §5: seekers travel outside the area constantly. */
	it("finds a stop outside the game area", () => {
		const result = searchStops(STOPS, "westkreuz", origin)[0];
		expect(result?.kind).toBe("stop");
		if (result?.kind === "stop") expect(result.stop.insideArea).toBe(false);
	});

	it("still reads a coordinate pair rather than searching for it", () => {
		const result = searchStops(STOPS, "52.52, 13.4", origin)[0];
		expect(result?.kind).toBe("coordinate");
	});
});

describe("nearestAtPx", () => {
	const project = (lngLat: readonly [number, number]) => ({
		x: lngLat[0] * 1000,
		y: lngLat[1] * 1000,
	});

	it("hits a station within the pixel slop", () => {
		const alex = STOPS.find((stop) => stop.stopId === "alexanderplatz");
		expect(alex).toBeDefined();
		if (!alex) return;
		const screen = project([alex.lng, alex.lat]);
		expect(nearestStopPx(STOPS, screen, project)?.stopId).toBe(
			"alexanderplatz",
		);
	});

	it("misses when the tap is far from every stop", () => {
		expect(nearestStopPx(STOPS, { x: 0, y: 0 }, project)).toBeNull();
	});

	it("finds a pin on top of a stop at the same point", () => {
		const alex = STOPS.find((stop) => stop.stopId === "alexanderplatz");
		expect(alex).toBeDefined();
		if (!alex) return;
		const pins = [{ id: "pin-1", lng: alex.lng, lat: alex.lat }];
		const screen = project([alex.lng, alex.lat]);
		expect(
			nearestAtPx(pins, screen, (pin) => [pin.lng, pin.lat], project, 24)?.id,
		).toBe("pin-1");
	});
});

describe("radiusConstraintReady", () => {
	it("needs at least one centre", () => {
		expect(radiusConstraintReady([])).toBe(false);
		expect(radiusConstraintReady([[13.4, 52.5]])).toBe(true);
		expect(
			radiusConstraintReady([
				[13.4, 52.5],
				[13.41, 52.51],
			]),
		).toBe(true);
	});
});

describe("constraintEditTool", () => {
	const row = (over: Partial<ConstraintListItem> = {}): ConstraintListItem => ({
		id: "c1",
		source: "manual",
		mode: "exclude",
		geometry: { kind: "radius", centers: [[13.4, 52.5]], radius: 500 },
		origin: null,
		enabled: true,
		name: null,
		...over,
	});

	it("reopens the tool the origin names, in the state it was left", () => {
		const edit = constraintEditTool(
			row({
				geometry: { kind: "polygon", polygons: [] },
				mode: "include",
				origin: {
					tool: "pickingClosestPoiConstraint",
					poiId: "poi-7",
					filterKind: "museum",
					radiusMeters: 800,
				},
			}),
		);
		expect(edit).toEqual({
			cut: false,
			tool: {
				kind: "pickingClosestPoiConstraint",
				filterKind: "museum",
				selectedId: "poi-7",
				radiusMeters: 800,
			},
		});
	});

	it("drops a type id the catalog no longer carries", () => {
		const edit = constraintEditTool(
			row({
				origin: {
					tool: "drawingRadiusConstraint",
					centers: [[13.4, 52.5]],
					radiusMeters: 500,
					poiKind: "phrenologist",
				},
			}),
		);
		expect(edit?.tool).toEqual({
			kind: "drawingRadiusConstraint",
			centers: [[13.4, 52.5]],
			radiusMeters: 500,
			poiKind: null,
			pickingKind: false,
		});
	});

	it("puts the cut/keep pair back where it was", () => {
		expect(constraintEditTool(row())?.cut).toBe(true);
		expect(constraintEditTool(row({ mode: "include" }))?.cut).toBe(false);
		// A split is always an exclude; which side falls away is `nearer`.
		expect(
			constraintEditTool(
				row({
					geometry: {
						kind: "halfPlane",
						a: [13.4, 52.5],
						b: [13.5, 52.6],
						nearer: "a",
					},
				}),
			)?.cut,
		).toBe(false);
	});

	it("recovers a circle and a split from geometry alone", () => {
		expect(constraintEditTool(row())?.tool).toEqual({
			kind: "drawingRadiusConstraint",
			centers: [[13.4, 52.5]],
			radiusMeters: 500,
			poiKind: null,
			pickingKind: false,
		});
		expect(
			constraintEditTool(
				row({
					geometry: {
						kind: "halfPlane",
						a: [13.4, 52.5],
						b: [13.5, 52.6],
						nearer: "b",
					},
				}),
			)?.tool,
		).toEqual({
			kind: "drawingSplitConstraint",
			from: [13.4, 52.5],
			to: [13.5, 52.6],
			focus: "from",
		});
	});

	it("offers nothing for an answer's cut, or an origin-less polygon", () => {
		expect(constraintEditTool(row({ source: "answer" }))).toBeNull();
		expect(
			constraintEditTool(row({ geometry: { kind: "polygon", polygons: [] } })),
		).toBeNull();
	});
});
