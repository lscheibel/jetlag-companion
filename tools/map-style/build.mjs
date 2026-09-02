import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/* ── palettes ─────────────────────────────────────────────────────────── */

/** Doc comments for the emitted PALETTE block, by key. */
export const DARK_NOTES = {
	void: "/** The ground. Unlit pixels. */",
	residential:
		"/** Residential blocks: barely a lift, enough to separate built from empty. */",
	waterway:
		"/** Canals and the Spree read brighter than open water; they are edges. */",
	path: "/** Footpaths, below the smallest road: many of them, rarely the point. */",
	roadMajorCasing:
		"/**\n * Majors are drawn as upstream draws them \u2014 a dark ribbon inside a lighter\n * casing \u2014 because on black an outlined road reads as a road at a glance and\n * a filled one reads as a smear.\n */",
	motorwayCasing:
		"/** Amber, pulled well down: a motorway is not how anybody wins this game. */",
	railMain:
		"/**\n * The network, by line. `subclass` in the tiles is what separates these, and\n * they are the signage colours a Berlin player already reads: U-Bahn blue,\n * S-Bahn green, tram red. Mainline rail is a steel that sits deliberately\n * brighter than `roadMajorCasing`, because from z8 to z11 it is the only\n * transit on the map and it has to win against the road web.\n */",
	halo: "/** Labels sit on top of everything; the halo is the ground, hard. */",
};

export const DARK = {
	void: "#000000",
	residential: "#070a12",
	water: "#0f314f",
	waterway: "#15486f",
	park: "#10331f",
	wood: "#0d2b1a",
	building: "#0d141d",
	buildingEdge: "#151e2a",
	path: "#182333",
	roadMinor: "#1d2836",
	roadMajorCasing: "#2c3c50",
	roadMajorInner: "#0e1621",
	motorwayCasing: "#55420f",
	motorwayInner: "#1c1405",
	railMain: "#4a5f7c",
	railSBahn: "#1b6446",
	railUBahn: "#2b6cb8",
	railTram: "#8f3527",
	boundary: "#33405a",
	label: "#8b9bb0",
	labelMinor: "#6c7d93",
	labelWater: "#4a7ea8",
	halo: "rgba(0,0,0,0.85)",
};

export const LIGHT_NOTES = {
	ground:
		"/**\n * The ground, matching `--map-land` in tokens.css so that the frame the map\n * has not covered yet is the same paper as the map.\n */",
	waterway: "/** Canals and the Spree, a shade down from open water. */",
	roadMinor:
		"/**\n * Positron's one big idea, kept: roads are white and everything else is not.\n * In sun that is the highest contrast available on the screen, and it costs\n * nothing to keep.\n */",
	railMain:
		"/**\n * The network, by line \u2014 the deep half of the signage palette, because these\n * sit on white rather than on black. U-Bahn blue, S-Bahn green, tram red,\n * and mainline rail as a steel dark enough to lead the road casings it\n * shares the country-scale view with.\n */",
};

export const LIGHT = {
	ground: "#e9eff5",
	residential: "#e2e9f1",
	water: "#b6d4ee",
	waterway: "#8fbfe4",
	park: "#c7e4c6",
	wood: "#b7ddb6",
	building: "#dde5ee",
	buildingEdge: "#c8d3e0",
	path: "#d7e0ea",
	roadMinor: "#ffffff",
	roadMajorCasing: "#c3d0df",
	roadMajorInner: "#ffffff",
	motorwayCasing: "#e2c176",
	motorwayInner: "#ffeec0",
	railMain: "#9aa8b8",
	railSBahn: "#00794a",
	railUBahn: "#0f5fc2",
	railTram: "#a45136",
	boundary: "#9aa8bd",
	label: "#22303f",
	labelMinor: "#55637a",
	labelWater: "#2c5f8f",
	halo: "rgba(255,255,255,0.85)",
};

/* ── shared shape: what the transit network looks like ────────────────── */

/**
 * One expression, used by every `class: transit` layer. `subclass` is what
 * separates a U-Bahn line from an S-Bahn line from a tram in the tiles.
 */
const transitColor = (P) => [
	"match",
	["get", "subclass"],
	"subway",
	P.railUBahn,
	"light_rail",
	P.railSBahn,
	"tram",
	P.railTram,
	P.railMain,
];

/** Thin at the zoom a whole city fits on, full width where a street does. */
const RAIL_WIDTH = [
	"interpolate",
	["exponential", 1.3],
	["zoom"],
	8,
	1.5,
	10,
	1.8,
	13,
	2.2,
	16,
	3,
	20,
	7,
];
/**
 * Rapid transit at full width, street trams at two thirds of it: a tram shares
 * the road it is drawn over, and at equal weight the pair reads as one striped
 * road rather than as a line and a street.
 */
const transitWidth = (stops) => [
	"interpolate",
	["exponential", 1.3],
	["zoom"],
	...stops.flatMap(([zoom, width]) => [
		zoom,
		[
			"match",
			["get", "subclass"],
			"tram",
			Number((width * 0.85).toFixed(2)),
			width,
		],
	]),
];

const TRANSIT_WIDTH = transitWidth([
	[11, 0.9],
	[14, 2],
	[16, 3],
	[20, 5],
]);

/**
 * How far out the network is drawn. Upstream starts heavy rail at z13 and
 * everything else at z16 — a whole city fits on z12, and the network is the
 * thing this game is played on.
 */
const rails = (P, ground, ids, symbolic) => {
	const expr = railExpressions(P, ground);
	const use = (key) => (symbolic ? `@@${key}@@` : expr[key]);
	return {
		[ids.rail]: {
			minzoom: 8,
			paint: { "line-color": P.railMain, "line-width": use("RAIL_WIDTH") },
		},
		[ids.transit]: {
			minzoom: 11,
			paint: {
				"line-color": use("TRANSIT_COLOR"),
				"line-width": use("TRANSIT_WIDTH"),
			},
		},
		[ids.service]: { paint: { "line-color": P.railMain } },
	};
};

export const railExpressions = (P) => ({
	TRANSIT_COLOR: transitColor(P),
	RAIL_WIDTH,
	TRANSIT_WIDTH,
});

const grassLayer = (P) => ({
	id: "landcover_grass",
	type: "fill",
	source: "openmaptiles",
	"source-layer": "landcover",
	filter: [
		"all",
		["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
		["==", ["get", "class"], "grass"],
	],
	paint: { "fill-color": P.park, "fill-opacity": 0.85 },
});

/* ── dark ─────────────────────────────────────────────────────────────── */

const D = DARK;
export const DARK_SPEC = {
	base: "dark.json",
	palette: D,
	notes: DARK_NOTES,
	paint: {
		background: { "background-color": D.void },
		water: { "fill-color": D.water },
		landcover_ice_shelf: { "fill-color": D.void },
		landcover_glacier: { "fill-color": D.residential },
		landuse_residential: { "fill-color": D.residential },
		landcover_wood: { "fill-color": D.wood },
		landuse_park: { "fill-color": D.park },
		waterway: { "line-color": D.waterway },
		water_name: { "text-color": D.labelWater, "text-halo-color": D.halo },
		building: {
			"fill-color": D.building,
			"fill-outline-color": D.buildingEdge,
		},
		"aeroway-taxiway": { "line-color": D.roadMinor },
		"aeroway-runway-casing": { "line-color": D.roadMajorCasing },
		"aeroway-area": { "fill-color": D.roadMajorInner },
		"aeroway-runway": { "line-color": D.roadMajorInner },
		road_area_pier: { "fill-color": D.residential },
		road_pier: { "line-color": D.residential },
		highway_path: { "line-color": D.path },
		highway_minor: { "line-color": D.roadMinor },
		highway_major_casing: { "line-color": D.roadMajorCasing },
		highway_major_inner: { "line-color": D.roadMajorInner },
		highway_major_subtle: { "line-color": D.roadMajorCasing },
		highway_motorway_casing: { "line-color": D.motorwayCasing },
		highway_motorway_inner: { "line-color": D.motorwayInner },
		highway_motorway_subtle: { "line-color": D.motorwayCasing },
		highway_name_other: {
			"text-color": D.labelMinor,
			"text-halo-color": D.halo,
		},
		highway_name_motorway: { "text-color": D.labelMinor },
		boundary_state: { "line-color": D.boundary },
		"boundary_country_z0-4": { "line-color": D.boundary },
		"boundary_country_z5-": { "line-color": D.boundary },
	},
	rails: (symbolic) =>
		rails(
			D,
			D.void,
			{
				rail: "railway",
				railDash: "railway_dashline",
				transit: "railway_transit",
				transitDash: "railway_transit_dashline",
				service: "railway_minor",
				serviceDash: "railway_minor_dashline",
			},
			symbolic,
		),
	places: [
		"place_other",
		"place_suburb",
		"place_village",
		"place_town",
		"place_city",
		"place_city_large",
		"place_state",
		"place_country_other",
		"place_country_minor",
		"place_country_major",
	],
	added: [{ before: "landcover_wood", layer: grassLayer(D) }],
	dropLayers: [
		"railway_dashline",
		"railway_transit_dashline",
		"railway_minor_dashline",
	],
	dropPaint: { landcover_wood: ["fill-pattern"] },
	reorder: [{ layer: "railway_transit", after: "railway" }],
	dropSources: ["ne2_shaded"],
};

/* ── light ────────────────────────────────────────────────────────────── */

const L = LIGHT;
export const LIGHT_SPEC = {
	base: "positron.json",
	palette: L,
	notes: LIGHT_NOTES,
	paint: {
		background: { "background-color": L.ground },
		park: { "fill-color": L.park },
		water: { "fill-color": L.water },
		landcover_ice_shelf: { "fill-color": L.ground },
		landcover_glacier: { "fill-color": L.ground },
		landuse_residential: { "fill-color": L.residential },
		landcover_wood: { "fill-color": L.wood },
		waterway: { "line-color": L.waterway },
		building: {
			"fill-color": L.building,
			"fill-outline-color": L.buildingEdge,
		},
		tunnel_motorway_casing: { "line-color": L.motorwayCasing },
		tunnel_motorway_inner: { "line-color": L.motorwayInner },
		"aeroway-taxiway": { "line-color": L.roadMajorCasing },
		"aeroway-runway-casing": { "line-color": L.roadMajorCasing },
		"aeroway-area": { "fill-color": L.roadMinor },
		"aeroway-runway": { "line-color": L.roadMinor },
		road_area_pier: { "fill-color": L.ground },
		road_pier: { "line-color": L.ground },
		highway_path: { "line-color": L.path },
		highway_minor: { "line-color": L.roadMinor },
		highway_major_casing: { "line-color": L.roadMajorCasing },
		highway_major_inner: { "line-color": L.roadMajorInner },
		highway_major_subtle: { "line-color": L.roadMajorCasing },
		highway_motorway_casing: { "line-color": L.motorwayCasing },
		highway_motorway_inner: { "line-color": L.motorwayInner },
		highway_motorway_subtle: { "line-color": L.motorwayCasing },
		highway_motorway_bridge_casing: { "line-color": L.motorwayCasing },
		highway_motorway_bridge_inner: { "line-color": L.motorwayInner },
		boundary_3: { "line-color": L.boundary },
		boundary_2: { "line-color": L.boundary },
		boundary_disputed: { "line-color": L.boundary },
		waterway_line_label: {
			"text-color": L.labelWater,
			"text-halo-color": L.halo,
		},
		water_name_point_label: {
			"text-color": L.labelWater,
			"text-halo-color": L.halo,
		},
		water_name_line_label: {
			"text-color": L.labelWater,
			"text-halo-color": L.halo,
		},
		"highway-name-path": {
			"text-color": L.labelMinor,
			"text-halo-color": L.halo,
		},
		"highway-name-minor": {
			"text-color": L.labelMinor,
			"text-halo-color": L.halo,
		},
		"highway-name-major": {
			"text-color": L.labelMinor,
			"text-halo-color": L.halo,
		},
		airport: { "text-color": L.labelMinor, "text-halo-color": L.halo },
	},
	rails: (symbolic) =>
		rails(
			L,
			L.roadMinor,
			{
				rail: "railway",
				railDash: "railway_dashline",
				transit: "railway_transit",
				transitDash: "railway_transit_dashline",
				service: "railway_service",
				serviceDash: "railway_service_dashline",
			},
			symbolic,
		),
	places: [
		"label_other",
		"label_village",
		"label_town",
		"label_state",
		"label_city",
		"label_city_capital",
		"label_country_3",
		"label_country_2",
		"label_country_1",
	],
	added: [{ before: "landcover_wood", layer: grassLayer(L) }],
	dropLayers: [
		"railway_dashline",
		"railway_transit_dashline",
		"railway_service_dashline",
	],
	dropPaint: { landcover_wood: ["fill-pattern"] },
	reorder: [{ layer: "railway_transit", after: "railway" }],
	dropSources: ["ne2_shaded"],
};

/* ── build ────────────────────────────────────────────────────────────── */

export function build(spec, symbolic = false) {
	const style = JSON.parse(
		readFileSync(new URL(`./upstream/${spec.base}`, import.meta.url), "utf8"),
	);
	const P = spec.palette;
	const patch = spec.rails(symbolic);
	const placePaint = { "text-color": P.label, "text-halo-color": P.halo };

	for (const layer of style.layers) {
		if (spec.paint[layer.id])
			layer.paint = { ...layer.paint, ...spec.paint[layer.id] };
		if (spec.places.includes(layer.id))
			layer.paint = { ...layer.paint, ...placePaint };
		const rail = patch[layer.id];
		if (rail) {
			if (rail.minzoom !== undefined) layer.minzoom = rail.minzoom;
			layer.paint = { ...layer.paint, ...rail.paint };
		}
	}
	for (const [id, keys] of Object.entries(spec.dropPaint)) {
		const layer = style.layers.find((l) => l.id === id);
		for (const key of keys) delete layer.paint[key];
	}
	style.layers = style.layers.filter((l) => !spec.dropLayers.includes(l.id));
	/**
	 * Upstream draws heavy rail last, so where an S-Bahn line shares an
	 * alignment with the long-distance tracks beside it — most of Berlin's
	 * network — the steel painted over the green and the line the players
	 * actually ride disappeared into freight. Transit goes on top.
	 */
	for (const { layer: id, after } of spec.reorder) {
		const moving = style.layers.find((l) => l.id === id);
		style.layers = style.layers.filter((l) => l.id !== id);
		const at = style.layers.findIndex((l) => l.id === after);
		style.layers.splice(at + 1, 0, moving);
	}
	for (const { before, layer } of spec.added) {
		const at = style.layers.findIndex((l) => l.id === before);
		style.layers.splice(at, 0, layer);
	}
	for (const source of spec.dropSources) delete style.sources[source];
	/**
	 * Positron ships `["linear", 1]` as an interpolation type in two boundary
	 * layers. `linear` takes no argument; MapLibre runs it anyway, the style
	 * spec's own types reject it, and it means what `["linear"]` means.
	 */
	JSON.stringify(style, (_key, value) => {
		if (Array.isArray(value) && value[0] === "linear" && value.length > 1)
			value.length = 1;
		return value;
	});
	return style;
}

/**
 * `node tools/map-style/build.mjs` writes the two styles as plain JSON into
 * `preview/`, which is what `preview.html` loads. Nothing in the app reads
 * these — `emit.mjs` is what writes the app's TypeScript.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
	const dir = new URL("./preview/", import.meta.url);
	mkdirSync(dir, { recursive: true });
	for (const [name, spec] of [
		["dark", DARK_SPEC],
		["light", LIGHT_SPEC],
	]) {
		writeFileSync(
			new URL(`./${name}.json`, dir),
			JSON.stringify(build(spec), null, "\t"),
		);
	}
	console.log("wrote tools/map-style/preview/{dark,light}.json");
}
