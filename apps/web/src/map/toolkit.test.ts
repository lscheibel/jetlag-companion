import { BERLIN_FIXTURE_CATALOG } from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";
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
	type SnapTarget,
	searchStops,
	snapToTarget,
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

	it("finds a pair inside a question", () => {
		expect(
			parsePastedCoordinates(
				"52.51971, 13.29455\n\nAre you within 1100m of us?",
			),
		).toEqual({ point: [13.29455, 52.51971], swapped: false });
		expect(
			parsePastedCoordinates("1km Thermometer start \n\n52.50506, 13.32180"),
		).toEqual({ point: [13.3218, 52.50506], swapped: false });
		expect(
			parsePastedCoordinates("500m Radar (again): 52.53448, 13.44355"),
		).toEqual({ point: [13.44355, 52.53448], swapped: false });
		expect(
			parsePastedCoordinates("Thermometer start: 52.516355,13.416487"),
		).toEqual({ point: [13.416487, 52.516355], swapped: false });
	});

	it("takes the first pair when a message carries two", () => {
		expect(
			parsePastedCoordinates("Q: 52.51971, 13.29455 — A: 52.53448, 13.44355"),
		).toEqual({ point: [13.29455, 52.51971], swapped: false });
	});

	it("does not read distances or zoom levels as a pair", () => {
		expect(parsePastedCoordinates("Are you within 1100m of us?")).toBeNull();
		expect(parsePastedCoordinates("500m Radar, 1km Thermometer")).toBeNull();
		expect(parsePastedCoordinates("zoomed to 15z at 1.5km")).toBeNull();
	});

	it("reads comma decimals", () => {
		expect(parsePastedCoordinates("52,3448, 13,44355")).toEqual({
			point: [13.44355, 52.3448],
			swapped: false,
		});
		expect(parsePastedCoordinates("52,3448 13,44355")).toEqual({
			point: [13.44355, 52.3448],
			swapped: false,
		});
		expect(parsePastedCoordinates("Radar (again): 52,3448, 13,44355")).toEqual({
			point: [13.44355, 52.3448],
			swapped: false,
		});
	});

	it("leaves a genuinely ambiguous comma string alone", () => {
		expect(parsePastedCoordinates("52,52,13,405")).toBeNull();
	});

	it("does not read a thousands separator as half a pair", () => {
		expect(parsePastedCoordinates("Within 1,532, 13.4498 km away")).toBeNull();
		expect(parsePastedCoordinates("1,532 13.4498")).toBeNull();
	});

	it("finds the coordinate past a thousands separator", () => {
		expect(parsePastedCoordinates("Within 1,532km at 53.3448,13.4498")).toEqual(
			{ point: [13.4498, 53.3448], swapped: false },
		);
		expect(
			parsePastedCoordinates("Within 1,532, 13.4498 km — at 53.3448,13.4498"),
		).toEqual({ point: [13.4498, 53.3448], swapped: false });
	});
});

describe("pasted map links", () => {
	const berlin: ParsedCoordinates = {
		point: [13.405, 52.52],
		swapped: false,
	};

	it("reads a Google Maps viewport link", () => {
		expect(parsePastedCoordinates("google.com/maps/@52.52,13.405,15z")).toEqual(
			berlin,
		);
		expect(
			parsePastedCoordinates(
				"https://www.google.com/maps/place/Berlin/@52.52,13.405,17z/data=!4m6",
			),
		).toEqual(berlin);
	});

	it("reads Google's place-detail pair", () => {
		expect(
			parsePastedCoordinates("https://www.google.com/maps/…!3d52.52!4d13.405"),
		).toEqual(berlin);
	});

	it("reads query-point links", () => {
		expect(
			parsePastedCoordinates("https://maps.apple.com/?ll=52.52,13.405&z=16"),
		).toEqual(berlin);
		expect(
			parsePastedCoordinates("https://maps.google.com/?q=52.52,13.405"),
		).toEqual(berlin);
		expect(
			parsePastedCoordinates("https://www.bing.com/maps?cp=52.52~13.405"),
		).toEqual(berlin);
	});

	it("reads an OpenStreetMap hash and a geo: URI", () => {
		expect(
			parsePastedCoordinates(
				"https://www.openstreetmap.org/#map=15/52.52/13.405",
			),
		).toEqual(berlin);
		expect(parsePastedCoordinates("geo:52.52,13.405")).toEqual(berlin);
	});

	it("takes a link at its word rather than at the area's", () => {
		// The link states its order, so an area that would rather have Berlin
		// does not get to move a point out of the Gulf of Aden.
		const berlinArea: BBox = [13.09, 52.34, 13.76, 52.68];
		expect(parsePastedCoordinates("geo:13.405,52.52", berlinArea)).toEqual({
			point: [52.52, 13.405],
			swapped: false,
		});
	});

	it("has nothing to read in a shortened link", () => {
		expect(
			parsePastedCoordinates("https://maps.app.goo.gl/aBcDeF123"),
		).toBeNull();
	});
});

describe("pasted coordinates, with a game area", () => {
	/** Berlin. */
	const berlinArea: BBox = [13.09, 52.34, 13.76, 52.68];

	it("reads a lng-first pair the right way round", () => {
		expect(parsePastedCoordinates("13.405, 52.52", berlinArea)).toEqual({
			point: [13.405, 52.52],
			swapped: true,
		});
	});

	it("leaves a lat-first pair alone", () => {
		expect(parsePastedCoordinates("52.52, 13.405", berlinArea)).toEqual({
			point: [13.405, 52.52],
			swapped: false,
		});
	});

	it("does not touch a pair that is nowhere near the area either way", () => {
		expect(parsePastedCoordinates("48.8584, 2.2945", berlinArea)).toEqual({
			point: [2.2945, 48.8584],
			swapped: false,
		});
	});

	it("does not touch a pair that reads as the area both ways round", () => {
		// Anywhere the two numbers are both plausible locally, the area has
		// nothing to say and lat-first stands.
		const square: BBox = [13.0, 13.0, 53.0, 53.0];
		expect(parsePastedCoordinates("52.52, 13.405", square)).toEqual({
			point: [13.405, 52.52],
			swapped: false,
		});
	});

	it("settles the order of a pair found in prose", () => {
		expect(
			parsePastedCoordinates("Radar (again): 13.44355, 52.53448", berlinArea),
		).toEqual({ point: [13.44355, 52.53448], swapped: true });
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

describe("snapToTarget", () => {
	const project = (lngLat: readonly [number, number]) => ({
		x: lngLat[0],
		y: lngLat[1],
	});
	const targets: SnapTarget[] = [
		{ point: [10, 0], maxPx: 24 },
		{ point: [40, 0], maxPx: 44 },
	];

	it("takes the nearest target the tap is inside", () => {
		expect(snapToTarget(targets, { x: 12, y: 0 }, project)).toEqual([10, 0]);
	});

	it("respects each target's own slop", () => {
		// 30 px out: past the 24 px dot, still inside the 44 px pin.
		expect(snapToTarget(targets, { x: 70, y: 0 }, project)).toEqual([40, 0]);
	});

	it("returns null on open map", () => {
		expect(snapToTarget(targets, { x: 200, y: 0 }, project)).toBeNull();
		expect(snapToTarget([], { x: 10, y: 0 }, project)).toBeNull();
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
