import type {
	DataDrivenPropertyValueSpecification,
	FilterSpecification,
	StyleSpecification,
} from "maplibre-gl";

/**
 * Zero Lag's own dark basemap. m2-spec §3.
 *
 * OpenFreeMap's `dark` style is a near-black grey wash: correct, restrained,
 * and built for a screen that will be looked at indoors. This game is played
 * outdoors at night, on a phone that is also the only light source and the only
 * battery, and the map is read at a glance between glances at the street.
 *
 * So the style is ours rather than theirs — OpenFreeMap's quick start says to
 * host the style JSON yourself once you change it, and this is that JSON, kept
 * as source. Three things move away from upstream:
 *
 * 1. **The ground is true black.** Not `rgb(12,12,12)`. On the OLED panel in
 *    every phone this app targets, a black pixel is an unlit pixel — it costs
 *    no battery and it has no glow, which is the difference between reading the
 *    map and lighting up your own hiding place.
 *
 * 2. **Colour carries the categories.** Water, parks and the transit network
 *    are the landmarks a hider actually navigates by, and on the upstream style
 *    they are four greys apart from everything else. The values sit
 *    deliberately low against black — the point is legibility at a glance in
 *    the dark, not a lit-up map.
 *
 * 3. **The network leads and the motorways follow.** Upstream draws rail as a
 *    hatch from z13 and everything else from z16; here rail is a solid line
 *    from z8 — the zoom its geometry first exists at — the transit lines from
 *    z11, and the motorway amber is pulled back so that at country scale the
 *    railways are what the eye lands on. This is a game about public transport;
 *    the map should be about public transport. The same change is made in
 *    `light-style.ts`.
 *
 *    The floors are the data's, not a preference: OpenMapTiles carries heavy
 *    rail from z8 and `light_rail` from z11, but `subway` and `tram` geometry
 *    only from z14. No style can draw a tram at z12.
 *
 *    Transit is also ordered *above* heavy rail, which upstream draws last.
 *    Berlin's S-Bahn mostly runs alongside the long-distance tracks, and in
 *    upstream's order the steel painted over the green — the line the players
 *    ride vanishing into the freight beside it.
 *
 * The landcover fills are ordered *below* `water`, which is not where
 * upstream puts them. OpenMapTiles folds `leisure=garden`, `leisure=park` and their
 * neighbours into `landcover` class `grass`, and those polygons are drawn whole
 * — a park that contains a lake is not hole-punched around it. Drawn after
 * water, the grass paints over the lake: the Britzer Garten's Hauptsee came out
 * green. Water goes last of the ground fills, and the lakes stay lakes.
 *
 * The tiles, sprite and glyphs are still OpenFreeMap's, so ATTRIBUTION in
 * `map-canvas` is unchanged and still required.
 *
 * Woodland is a flat fill rather than upstream's `wood-pattern`: that sprite
 * image is not in the sprite sheet OpenFreeMap serves, so every map built on
 * their dark style logs a missing-image warning and paints nothing there.
 *
 * Two layers exist here that upstream has no equivalent of: `landcover_grass`
 * and `park`. OpenFreeMap's dark style paints `landuse` class `park`, and in
 * OpenMapTiles that class does not exist — Berlin's parks arrive as `landcover`
 * class `grass`, so Tiergarten and Tempelhofer Feld render as bare ground on
 * every one of their dark maps. A park is a hiding place; it gets to be visible.
 *
 * To re-derive against a newer upstream: fetch
 * `https://tiles.openfreemap.org/styles/dark`, diff its layer list against the
 * one below, and carry over anything new. The palette is the only thing here
 * worth hand-editing.
 */

const PALETTE = {
	/** The ground. Unlit pixels. */
	void: "#000000",
	/** Residential blocks: barely a lift, enough to separate built from empty. */
	residential: "#070a12",
	water: "#0f314f",
	/** Canals and the Spree read brighter than open water; they are edges. */
	waterway: "#15486f",
	park: "#10331f",
	wood: "#0d2b1a",
	building: "#0d141d",
	buildingEdge: "#151e2a",
	/** Footpaths, below the smallest road: many of them, rarely the point. */
	path: "#182333",
	roadMinor: "#1d2836",
	/**
	 * Majors are drawn as upstream draws them — a dark ribbon inside a lighter
	 * casing — because on black an outlined road reads as a road at a glance and
	 * a filled one reads as a smear.
	 */
	roadMajorCasing: "#2c3c50",
	roadMajorInner: "#0e1621",
	/** Amber, pulled well down: a motorway is not how anybody wins this game. */
	motorwayCasing: "#3b3013",
	motorwayInner: "#1c1405",
	/**
	 * The network, by line. `subclass` in the tiles is what separates these, and
	 * they are the signage colours a Berlin player already reads: U-Bahn blue,
	 * S-Bahn green, tram red. Mainline rail is a steel that sits deliberately
	 * brighter than `roadMajorCasing`, because from z8 to z11 it is the only
	 * transit on the map and it has to win against the road web.
	 */
	railMain: "#4a5f7c",
	railSBahn: "#335446",
	railUBahn: "#2b6cb8",
	railTram: "#402521",
	boundary: "#33405a",
	label: "#8b9bb0",
	labelMinor: "#6c7d93",
	labelWater: "#4a7ea8",
	/** Labels sit on top of everything; the halo is the ground, hard. */
	halo: "rgba(0,0,0,0.85)",
} as const;

/**
 * Everything on `class: transit`, tunnels included.
 *
 * Upstream's filter ends in `["match", ["get", "brunnel"], ["tunnel"], false,
 * true]`, which throws tunnelled track away — and Berlin's U-Bahn is tunnel
 * almost end to end, as is the S-Bahn's Nord-Süd line. On their styles the
 * city's rapid transit is simply absent. A line you cannot see from the street
 * is still a line you can get on.
 */
const TRANSIT_FILTER: FilterSpecification = [
	"all",
	["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
	["==", ["get", "class"], "transit"],
];

/**
 * Underground, drawn back. Not a dash: these are already thin lines and a
 * dashed thin line at 2px is a smudge. Opacity says "below you" without costing
 * legibility.
 */
const TUNNEL_OPACITY: DataDrivenPropertyValueSpecification<number> = [
	"match",
	["get", "brunnel"],
	"tunnel",
	0.6,
	1,
];

/**
 * The transit network, coloured by what kind of line it is. `subclass` is the
 * tiles' own word for it, and these are the signage colours the city uses:
 * U-Bahn blue, S-Bahn green, tram amber. Anything else — a funicular, a
 * monorail — falls through to plain rail.
 */
const TRANSIT_COLOR: DataDrivenPropertyValueSpecification<string> = [
	"match",
	["get", "subclass"],
	"subway",
	PALETTE.railUBahn,
	"light_rail",
	PALETTE.railSBahn,
	"tram",
	PALETTE.railTram,
	PALETTE.railMain,
];

/**
 * Heavy rail, thin where a whole city fits on the screen and full width where a
 * street does.
 */
const RAIL_WIDTH: DataDrivenPropertyValueSpecification<number> = [
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
const TRANSIT_WIDTH: DataDrivenPropertyValueSpecification<number> = [
	"interpolate",
	["exponential", 1.3],
	["zoom"],
	11,
	["match", ["get", "subclass"], "tram", 0.77, 0.9],
	14,
	["match", ["get", "subclass"], "tram", 1.7, 2],
	16,
	["match", ["get", "subclass"], "tram", 2.55, 3],
	20,
	["match", ["get", "subclass"], "tram", 4.25, 5],
];

export const DARK_MAP_STYLE = {
	version: 8,
	sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
	glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
	sources: {
		openmaptiles: {
			type: "vector",
			url: "https://tiles.openfreemap.org/planet",
		},
	},
	layers: [
		{
			id: "background",
			type: "background",
			paint: {
				"background-color": PALETTE.void,
			},
		},
		{
			id: "landuse_residential",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landuse",
			maxzoom: 9,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "residential"],
			],
			paint: {
				"fill-color": PALETTE.residential,
				"fill-opacity": 0.4,
			},
		},
		{
			id: "landcover_grass",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landcover",
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "grass"],
			],
			paint: {
				"fill-color": PALETTE.park,
				"fill-opacity": 0.85,
			},
		},
		{
			id: "landcover_wood",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landcover",
			minzoom: 10,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "wood"],
			],
			paint: {
				"fill-color": PALETTE.wood,
				"fill-opacity": [
					"interpolate",
					["exponential", 0.3],
					["zoom"],
					8,
					0,
					10,
					0.8,
					13,
					0.4,
				],
				"fill-translate": [0, 0],
			},
		},
		{
			id: "landuse_park",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landuse",
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "park"],
			],
			paint: {
				"fill-color": PALETTE.park,
			},
		},
		{
			id: "water",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "water",
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["!=", ["get", "brunnel"], "tunnel"],
			],
			paint: {
				"fill-antialias": false,
				"fill-color": PALETTE.water,
			},
		},
		{
			id: "landcover_ice_shelf",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landcover",
			maxzoom: 8,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "subclass"], "ice_shelf"],
			],
			paint: {
				"fill-color": PALETTE.void,
				"fill-opacity": 0.7,
			},
		},
		{
			id: "landcover_glacier",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landcover",
			maxzoom: 8,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "subclass"], "glacier"],
			],
			paint: {
				"fill-color": PALETTE.residential,
				"fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 0.5],
			},
		},
		{
			id: "waterway",
			type: "line",
			source: "openmaptiles",
			"source-layer": "waterway",
			filter: [
				"match",
				["geometry-type"],
				["LineString", "MultiLineString"],
				true,
				false,
			],
			paint: {
				"line-color": PALETTE.waterway,
			},
		},
		{
			id: "water_name",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "water_name",
			filter: [
				"match",
				["geometry-type"],
				["LineString", "MultiLineString"],
				true,
				false,
			],
			layout: {
				"symbol-placement": "line",
				"symbol-spacing": 500,
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "map",
				"text-size": 12,
			},
			paint: {
				"text-color": PALETTE.labelWater,
				"text-halo-color": PALETTE.halo,
			},
		},
		{
			id: "building",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "building",
			minzoom: 12,
			filter: [
				"match",
				["geometry-type"],
				["MultiPolygon", "Polygon"],
				true,
				false,
			],
			paint: {
				"fill-antialias": true,
				"fill-color": PALETTE.building,
				"fill-outline-color": PALETTE.buildingEdge,
			},
		},
		{
			id: "aeroway-taxiway",
			type: "line",
			source: "openmaptiles",
			"source-layer": "aeroway",
			minzoom: 12,
			filter: ["match", ["get", "class"], ["taxiway"], true, false],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMinor,
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.55],
					["zoom"],
					13,
					1.8,
					20,
					20,
				],
			},
		},
		{
			id: "aeroway-runway-casing",
			type: "line",
			source: "openmaptiles",
			"source-layer": "aeroway",
			minzoom: 11,
			filter: ["match", ["get", "class"], ["runway"], true, false],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMajorCasing,
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.5],
					["zoom"],
					11,
					5,
					17,
					55,
				],
			},
		},
		{
			id: "aeroway-area",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "aeroway",
			minzoom: 4,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["match", ["get", "class"], ["runway", "taxiway"], true, false],
			],
			paint: {
				"fill-color": PALETTE.roadMajorInner,
				"fill-opacity": 1,
			},
		},
		{
			id: "aeroway-runway",
			type: "line",
			source: "openmaptiles",
			"source-layer": "aeroway",
			minzoom: 11,
			filter: [
				"all",
				["match", ["get", "class"], ["runway"], true, false],
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMajorInner,
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.5],
					["zoom"],
					11,
					4,
					17,
					50,
				],
			},
		},
		{
			id: "road_area_pier",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "transportation",
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "pier"],
			],
			paint: {
				"fill-antialias": true,
				"fill-color": PALETTE.residential,
			},
		},
		{
			id: "road_pier",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["match", ["get", "class"], ["pier"], true, false],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.residential,
				"line-width": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					15,
					1,
					17,
					4,
				],
			},
		},
		{
			id: "highway_path",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "path"],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.path,
				"line-dasharray": [1.5, 1.5],
				"line-opacity": 0.9,
				"line-width": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					13,
					1,
					20,
					10,
				],
			},
		},
		{
			id: "highway_minor",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 8,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["match", ["get", "class"], ["minor", "service", "track"], true, false],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMinor,
				"line-opacity": 0.9,
				"line-width": [
					"interpolate",
					["exponential", 1.55],
					["zoom"],
					13,
					1.8,
					20,
					20,
				],
			},
		},
		{
			id: "highway_major_casing",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 11,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				[
					"match",
					["get", "class"],
					["primary", "secondary", "tertiary", "trunk"],
					true,
					false,
				],
			],
			layout: {
				"line-cap": "butt",
				"line-join": "miter",
			},
			paint: {
				"line-color": PALETTE.roadMajorCasing,
				"line-dasharray": [12, 0],
				"line-width": [
					"interpolate",
					["exponential", 1.3],
					["zoom"],
					10,
					3,
					20,
					23,
				],
			},
		},
		{
			id: "highway_major_inner",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 11,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				[
					"match",
					["get", "class"],
					["primary", "secondary", "tertiary", "trunk"],
					true,
					false,
				],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMajorInner,
				"line-width": [
					"interpolate",
					["exponential", 1.3],
					["zoom"],
					10,
					2,
					20,
					20,
				],
			},
		},
		{
			id: "highway_major_subtle",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 6,
			maxzoom: 11,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				[
					"match",
					["get", "class"],
					["primary", "secondary", "tertiary", "trunk"],
					true,
					false,
				],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.roadMajorCasing,
				"line-width": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 2],
			},
		},
		{
			id: "highway_motorway_casing",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 6,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "motorway"],
			],
			layout: {
				"line-cap": "butt",
				"line-join": "miter",
			},
			paint: {
				"line-color": PALETTE.motorwayCasing,
				"line-dasharray": [2, 0],
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.4],
					["zoom"],
					5.8,
					0,
					6,
					3,
					20,
					40,
				],
			},
		},
		{
			id: "highway_motorway_inner",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 6,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "motorway"],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.motorwayInner,
				"line-width": [
					"interpolate",
					["exponential", 1.4],
					["zoom"],
					4,
					2,
					6,
					1.3,
					20,
					30,
				],
			},
		},
		{
			id: "road_oneway",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 15,
			filter: ["==", ["get", "oneway"], 1],
			layout: {
				"icon-image": "oneway",
				"icon-padding": 2,
				"icon-rotate": 0,
				"icon-rotation-alignment": "map",
				"icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.5, 19, 1],
				"symbol-placement": "line",
				"symbol-spacing": 200,
			},
			paint: {
				"icon-opacity": 0.5,
			},
		},
		{
			id: "road_oneway_opposite",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 15,
			filter: ["==", ["get", "oneway"], -1],
			layout: {
				"icon-image": "oneway",
				"icon-padding": 2,
				"icon-rotate": 180,
				"icon-rotation-alignment": "map",
				"icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.5, 19, 1],
				"symbol-placement": "line",
				"symbol-spacing": 200,
			},
			paint: {
				"icon-opacity": 0.5,
			},
		},
		{
			id: "highway_motorway_subtle",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			maxzoom: 6,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "motorway"],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.motorwayCasing,
				"line-width": [
					"interpolate",
					["exponential", 1.4],
					["zoom"],
					4,
					2,
					6,
					1.3,
				],
			},
		},
		{
			id: "railway_minor",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 16,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["all", ["==", ["get", "class"], "rail"], ["has", "service"]],
			],
			layout: {
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.railMain,
				"line-width": 3,
			},
		},
		{
			id: "railway",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 8,
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "rail"],
				["!", ["has", "service"]],
			],
			layout: {
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.railMain,
				"line-width": RAIL_WIDTH,
			},
		},
		{
			id: "railway_transit",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			minzoom: 11,
			filter: TRANSIT_FILTER,
			layout: {
				"line-join": "round",
			},
			paint: {
				"line-color": TRANSIT_COLOR,
				"line-width": TRANSIT_WIDTH,
				"line-opacity": TUNNEL_OPACITY,
			},
		},
		{
			id: "highway_name_other",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			filter: [
				"all",
				["!=", ["get", "class"], "motorway"],
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
			],
			layout: {
				"symbol-placement": "line",
				"symbol-spacing": 350,
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-max-angle": 30,
				"text-pitch-alignment": "viewport",
				"text-rotation-alignment": "map",
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-halo-blur": 0,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
				"text-translate": [0, 0],
			},
		},
		{
			id: "highway_name_motorway",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			filter: [
				"all",
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["==", ["get", "class"], "motorway"],
			],
			layout: {
				"symbol-placement": "line",
				"symbol-spacing": 350,
				"text-field": ["to-string", ["get", "ref"]],
				"text-font": ["Noto Sans Regular"],
				"text-pitch-alignment": "viewport",
				"text-rotation-alignment": "viewport",
				"text-size": 10,
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-translate": [0, 2],
			},
		},
		{
			id: "boundary_state",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			filter: ["==", ["get", "admin_level"], 4],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-blur": 0.4,
				"line-color": PALETTE.boundary,
				"line-dasharray": [2, 2],
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.3],
					["zoom"],
					3,
					1,
					22,
					15,
				],
			},
		},
		{
			id: "boundary_country_z0-4",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			maxzoom: 5,
			filter: [
				"all",
				["==", ["get", "admin_level"], 2],
				["!", ["has", "claimed_by"]],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-blur": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 22, 4],
				"line-color": PALETTE.boundary,
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.1],
					["zoom"],
					3,
					1,
					22,
					20,
				],
			},
		},
		{
			id: "boundary_country_z5-",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			minzoom: 5,
			filter: ["==", ["get", "admin_level"], 2],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-blur": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 22, 4],
				"line-color": PALETTE.boundary,
				"line-opacity": 1,
				"line-width": [
					"interpolate",
					["exponential", 1.1],
					["zoom"],
					3,
					1,
					22,
					20,
				],
			},
		},
		{
			id: "place_other",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 14,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				[
					"match",
					["get", "class"],
					["hamlet", "isolated_dwelling", "neighbourhood"],
					true,
					false,
				],
			],
			layout: {
				"text-anchor": "center",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "center",
				"text-offset": [0.5, 0],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_suburb",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 15,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "suburb"],
			],
			layout: {
				"text-anchor": "center",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "center",
				"text-offset": [0.5, 0],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_village",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 14,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "village"],
			],
			layout: {
				"icon-size": 0.4,
				"text-anchor": "left",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "left",
				"text-offset": [0.5, 0.2],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"icon-opacity": 0.7,
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_town",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 15,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "town"],
			],
			layout: {
				"icon-image": ["step", ["zoom"], "circle-11", 9, ""],
				"icon-size": 0.4,
				"text-anchor": ["step", ["zoom"], "left", 8, "center"],
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "left",
				"text-offset": [0.5, 0.2],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"icon-opacity": 0.7,
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_city",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 14,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "city"],
				[">", ["get", "rank"], 3],
			],
			layout: {
				"icon-image": ["step", ["zoom"], "circle-11", 9, ""],
				"icon-size": 0.4,
				"text-anchor": ["step", ["zoom"], "left", 8, "center"],
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "left",
				"text-offset": [0.5, 0.2],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"icon-opacity": 0.7,
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_city_large",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 12,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["<=", ["get", "rank"], 3],
				["==", ["get", "class"], "city"],
			],
			layout: {
				"icon-image": ["step", ["zoom"], "circle-11", 9, ""],
				"icon-size": 0.4,
				"text-anchor": ["step", ["zoom"], "left", 8, "center"],
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-justify": "left",
				"text-offset": [0.5, 0.2],
				"text-size": 14,
				"text-transform": "uppercase",
			},
			paint: {
				"icon-opacity": 0.7,
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_state",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 12,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "state"],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-size": 10,
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "place_country_other",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 8,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "country"],
				["!", ["has", "iso_a2"]],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-size": ["interpolate", ["linear"], ["zoom"], 0, 9, 1, 11],
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.4,
			},
		},
		{
			id: "place_country_minor",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 8,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["==", ["get", "class"], "country"],
				[">=", ["get", "rank"], 2],
				["has", "iso_a2"],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-size": ["interpolate", ["linear"], ["zoom"], 0, 10, 6, 12],
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.4,
			},
		},
		{
			id: "place_country_major",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 6,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPoint", "Point"], true, false],
				["<=", ["get", "rank"], 1],
				["==", ["get", "class"], "country"],
				["has", "iso_a2"],
			],
			layout: {
				"text-anchor": "center",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-size": [
					"interpolate",
					["exponential", 1.4],
					["zoom"],
					0,
					10,
					3,
					12,
					4,
					14,
				],
				"text-transform": "uppercase",
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.4,
			},
		},
	],
} satisfies StyleSpecification;
