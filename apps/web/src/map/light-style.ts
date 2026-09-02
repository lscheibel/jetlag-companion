import type {
	DataDrivenPropertyValueSpecification,
	StyleSpecification,
} from "maplibre-gl";

/**
 * Zero Lag's own light basemap, the daylight half of `dark-style.ts`. m2-spec §3.
 *
 * Derived from OpenFreeMap's Positron rather than from their dark style — the
 * two are different styles with different layer lists, so this is a second file
 * rather than a second palette. Positron's logic is kept, because it is right:
 * white roads on a quiet ground, and nothing else competing with them. What
 * changes is what the quiet ground is quiet *about*.
 *
 * 1. **Colour carries the categories.** Positron renders water, parks and rail
 *    as four separate greys, which reads beautifully on a desk and vanishes on
 *    a phone held at arm's length in the sun. Water is water-blue, parks are
 *    green, motorways are tram amber, and the ground is the same
 *    `--map-land` the app paints behind the map.
 *
 * 2. **The network leads and the motorways follow.** Same change as the dark
 *    style, same reasoning — solid rail from z8, transit lines from z11, and
 *    Positron's motorway amber pulled back so the railways are what the eye
 *    lands on at country scale. Its rail hatch goes too: at the widths these
 *    lines are drawn at, a hatch reads as a dotted smudge rather than as a
 *    railway.
 *
 *    Those floors are the data's. OpenMapTiles carries heavy rail from z8 and
 *    `light_rail` from z11, but `subway` and `tram` geometry only from z14.
 *
 *    Transit is also ordered *above* heavy rail, which upstream draws last.
 *    Berlin's S-Bahn mostly runs alongside the long-distance tracks, and in
 *    upstream's order the steel painted over the green — the line the players
 *    ride vanishing into the freight beside it.
 *
 * Woodland is a flat fill rather than upstream's `wood-pattern`, which is not
 * in the sprite sheet OpenFreeMap serves.
 *
 * `landcover_grass` is ours. Positron has a `park` layer, but it draws the
 * OpenMapTiles `park` source-layer, which holds nature reserves and protected
 * areas — Berlin's actual parks arrive as `landcover` class `grass` and go
 * unpainted, which is why Tiergarten is bare ground on their map.
 *
 * Tiles, sprite and glyphs are still OpenFreeMap's; ATTRIBUTION is unchanged
 * and still required. To re-derive: fetch
 * `https://tiles.openfreemap.org/styles/positron` and diff its layer list
 * against the one below.
 */

const PALETTE = {
	/**
	 * The ground, matching `--map-land` in tokens.css so that the frame the map
	 * has not covered yet is the same paper as the map.
	 */
	ground: "#e9eff5",
	residential: "#e2e9f1",
	water: "#b6d4ee",
	/** Canals and the Spree, a shade down from open water. */
	waterway: "#8fbfe4",
	park: "#c7e4c6",
	wood: "#b7ddb6",
	building: "#dde5ee",
	buildingEdge: "#c8d3e0",
	path: "#d7e0ea",
	/**
	 * Positron's one big idea, kept: roads are white and everything else is not.
	 * In sun that is the highest contrast available on the screen, and it costs
	 * nothing to keep.
	 */
	roadMinor: "#ffffff",
	roadMajorCasing: "#c3d0df",
	roadMajorInner: "#ffffff",
	motorwayCasing: "#f0d189",
	motorwayInner: "#fff5d9",
	/**
	 * The network, by line — the deep half of the signage palette, because these
	 * sit on white rather than on black. U-Bahn blue, S-Bahn green, tram red,
	 * and mainline rail as a steel dark enough to lead the road casings it
	 * shares the country-scale view with.
	 */
	railMain: "#9aa8b8",
	railSBahn: "#0d9460",
	railUBahn: "#126cdb",
	railTram: "#ffa494",
	boundary: "#9aa8bd",
	label: "#22303f",
	labelMinor: "#55637a",
	labelWater: "#2c5f8f",
	halo: "rgba(255,255,255,0.85)",
} as const;

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

export const LIGHT_MAP_STYLE = {
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
				"background-color": PALETTE.ground,
			},
		},
		{
			id: "park",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "park",
			filter: [
				"match",
				["geometry-type"],
				["MultiPolygon", "Polygon"],
				true,
				false,
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
				"fill-antialias": true,
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
				"fill-color": PALETTE.ground,
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
				"fill-color": PALETTE.ground,
				"fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 0.5],
			},
		},
		{
			id: "landuse_residential",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "landuse",
			maxzoom: 16,
			filter: [
				"all",
				["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
				["==", ["get", "class"], "residential"],
			],
			paint: {
				"fill-color": PALETTE.residential,
				"fill-opacity": [
					"interpolate",
					["exponential", 0.6],
					["zoom"],
					8,
					0.8,
					9,
					0.6,
				],
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
				"fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 12, 1],
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
			id: "building",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "building",
			minzoom: 12,
			paint: {
				"fill-antialias": true,
				"fill-color": PALETTE.building,
				"fill-outline-color": PALETTE.buildingEdge,
			},
		},
		{
			id: "tunnel_motorway_casing",
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
				[
					"all",
					["==", ["get", "brunnel"], "tunnel"],
					["==", ["get", "class"], "motorway"],
				],
			],
			layout: {
				"line-cap": "butt",
				"line-join": "miter",
			},
			paint: {
				"line-color": PALETTE.motorwayCasing,
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
			id: "tunnel_motorway_inner",
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
				[
					"all",
					["==", ["get", "brunnel"], "tunnel"],
					["==", ["get", "class"], "motorway"],
				],
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
				"line-color": PALETTE.roadMajorCasing,
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
					6,
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
				"fill-color": PALETTE.roadMinor,
				"fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
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
				"line-color": PALETTE.roadMinor,
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
				"fill-color": PALETTE.ground,
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
				"line-color": PALETTE.ground,
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
				"line-color": PALETTE.roadMinor,
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
				"line-width": 2,
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
				[
					"all",
					["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true],
					["==", ["get", "class"], "motorway"],
				],
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
				[
					"all",
					["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true],
					["==", ["get", "class"], "motorway"],
				],
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
			id: "railway_service",
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
				["all", ["!", ["has", "service"]], ["==", ["get", "class"], "rail"]],
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
					"all",
					["==", ["get", "class"], "transit"],
					["match", ["get", "brunnel"], ["tunnel"], false, true],
				],
			],
			layout: {
				"line-join": "round",
			},
			paint: {
				"line-color": TRANSIT_COLOR,
				"line-width": TRANSIT_WIDTH,
			},
		},
		{
			id: "highway_motorway_bridge_casing",
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
				[
					"all",
					["==", ["get", "brunnel"], "bridge"],
					["==", ["get", "class"], "motorway"],
				],
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
					5,
					20,
					45,
				],
			},
		},
		{
			id: "highway_motorway_bridge_inner",
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
				[
					"all",
					["==", ["get", "brunnel"], "bridge"],
					["==", ["get", "class"], "motorway"],
				],
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
			id: "boundary_3",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			minzoom: 8,
			filter: [
				"all",
				[">=", ["get", "admin_level"], 3],
				["<=", ["get", "admin_level"], 6],
				["!=", ["get", "maritime"], 1],
				["!=", ["get", "disputed"], 1],
				["!", ["has", "claimed_by"]],
			],
			paint: {
				"line-color": PALETTE.boundary,
				"line-dasharray": [1, 1],
				"line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 11, 2],
			},
		},
		{
			id: "boundary_2",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			filter: [
				"all",
				["==", ["get", "admin_level"], 2],
				["!=", ["get", "maritime"], 1],
				["!=", ["get", "disputed"], 1],
				["!", ["has", "claimed_by"]],
			],
			layout: {
				"line-cap": "round",
				"line-join": "round",
			},
			paint: {
				"line-color": PALETTE.boundary,
				"line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 1],
				"line-width": [
					"interpolate",
					["linear"],
					["zoom"],
					3,
					1,
					5,
					1.2,
					12,
					3,
				],
			},
		},
		{
			id: "boundary_disputed",
			type: "line",
			source: "openmaptiles",
			"source-layer": "boundary",
			filter: [
				"all",
				["!=", ["get", "maritime"], 1],
				["==", ["get", "disputed"], 1],
			],
			paint: {
				"line-color": PALETTE.boundary,
				"line-dasharray": [1, 2],
				"line-width": [
					"interpolate",
					["linear"],
					["zoom"],
					3,
					1,
					5,
					1.2,
					12,
					3,
				],
			},
		},
		{
			id: "waterway_line_label",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "waterway",
			minzoom: 10,
			filter: [
				"match",
				["geometry-type"],
				["LineString", "MultiLineString"],
				true,
				false,
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
				"text-font": ["Noto Sans Italic"],
				"text-letter-spacing": 0.2,
				"text-max-width": 5,
				"text-size": 14,
			},
			paint: {
				"text-color": PALETTE.labelWater,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.5,
			},
		},
		{
			id: "water_name_point_label",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "water_name",
			filter: [
				"match",
				["geometry-type"],
				["MultiPoint", "Point"],
				true,
				false,
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Italic"],
				"text-letter-spacing": 0.2,
				"text-max-width": 5,
				"text-size": ["interpolate", ["linear"], ["zoom"], 0, 10, 8, 14],
			},
			paint: {
				"text-color": PALETTE.labelWater,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.5,
			},
		},
		{
			id: "water_name_line_label",
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
				"symbol-spacing": 350,
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Italic"],
				"text-letter-spacing": 0.2,
				"text-max-width": 5,
				"text-size": 14,
			},
			paint: {
				"text-color": PALETTE.labelWater,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1.5,
			},
		},
		{
			id: "highway-name-path",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 15.5,
			filter: ["==", ["get", "class"], "path"],
			layout: {
				"symbol-placement": "line",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "map",
				"text-size": ["interpolate", ["linear"], ["zoom"], 13, 12, 14, 13],
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 0.5,
			},
		},
		{
			id: "highway-name-minor",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 15,
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
				"symbol-placement": "line",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "map",
				"text-size": ["interpolate", ["linear"], ["zoom"], 13, 12, 14, 13],
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-halo-blur": 0.5,
				"text-halo-width": 1,
				"text-halo-color": PALETTE.halo,
			},
		},
		{
			id: "highway-name-major",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 12.2,
			filter: [
				"match",
				["get", "class"],
				["primary", "secondary", "tertiary", "trunk"],
				true,
				false,
			],
			layout: {
				"symbol-placement": "line",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "map",
				"text-size": ["interpolate", ["linear"], ["zoom"], 13, 12, 14, 13],
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-halo-blur": 0.5,
				"text-halo-width": 1,
				"text-halo-color": PALETTE.halo,
			},
		},
		{
			id: "highway-shield-non-us",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 11,
			filter: [
				"all",
				["<=", ["get", "ref_length"], 6],
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				[
					"match",
					["get", "network"],
					["us-highway", "us-interstate", "us-state"],
					false,
					true,
				],
			],
			layout: {
				"icon-image": ["concat", "road_", ["get", "ref_length"]],
				"icon-rotation-alignment": "viewport",
				"icon-size": 1,
				"symbol-placement": ["step", ["zoom"], "point", 11, "line"],
				"symbol-spacing": 200,
				"text-field": ["to-string", ["get", "ref"]],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "viewport",
				"text-size": 10,
			},
		},
		{
			id: "highway-shield-us-interstate",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 11,
			filter: [
				"all",
				["<=", ["get", "ref_length"], 6],
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["match", ["get", "network"], ["us-interstate"], true, false],
			],
			layout: {
				"icon-image": [
					"concat",
					["get", "network"],
					"_",
					["get", "ref_length"],
				],
				"icon-rotation-alignment": "viewport",
				"icon-size": 1,
				"symbol-placement": ["step", ["zoom"], "point", 7, "line", 8, "line"],
				"symbol-spacing": 200,
				"text-field": ["to-string", ["get", "ref"]],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "viewport",
				"text-size": 10,
			},
		},
		{
			id: "road_shield_us",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "transportation_name",
			minzoom: 12,
			filter: [
				"all",
				["<=", ["get", "ref_length"], 6],
				[
					"match",
					["geometry-type"],
					["LineString", "MultiLineString"],
					true,
					false,
				],
				["match", ["get", "network"], ["us-highway", "us-state"], true, false],
			],
			layout: {
				"icon-image": [
					"concat",
					["get", "network"],
					"_",
					["get", "ref_length"],
				],
				"icon-rotation-alignment": "viewport",
				"icon-size": 1,
				"symbol-placement": ["step", ["zoom"], "point", 11, "line"],
				"symbol-spacing": 200,
				"text-field": ["to-string", ["get", "ref"]],
				"text-font": ["Noto Sans Regular"],
				"text-rotation-alignment": "viewport",
				"text-size": 10,
			},
		},
		{
			id: "airport",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "aerodrome_label",
			minzoom: 11,
			filter: ["all", ["has", "iata"]],
			layout: {
				"icon-image": "airport_11",
				"icon-size": 1,
				"text-anchor": "top",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-max-width": 9,
				"text-offset": [0, 0.6],
				"text-optional": true,
				"text-padding": 2,
				"text-size": 12,
			},
			paint: {
				"text-color": PALETTE.labelMinor,
				"text-halo-blur": 0.5,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_other",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 8,
			filter: [
				"match",
				["get", "class"],
				["city", "continent", "country", "state", "town", "village"],
				false,
				true,
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Italic"],
				"text-letter-spacing": 0.1,
				"text-max-width": 9,
				"text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 12, 10],
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
			id: "label_village",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 9,
			filter: ["==", ["get", "class"], "village"],
			layout: {
				"icon-allow-overlap": true,
				"icon-image": ["step", ["zoom"], "circle_11_black", 10, ""],
				"icon-optional": false,
				"icon-size": 0.2,
				"text-anchor": "bottom",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-max-width": 8,
				"text-size": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					7,
					10,
					11,
					12,
				],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_town",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 6,
			filter: ["==", ["get", "class"], "town"],
			layout: {
				"icon-allow-overlap": true,
				"icon-image": ["step", ["zoom"], "circle_11_black", 10, ""],
				"icon-optional": false,
				"icon-size": 0.2,
				"text-anchor": "bottom",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-max-width": 8,
				"text-size": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					7,
					12,
					11,
					14,
				],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_state",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 5,
			maxzoom: 8,
			filter: ["==", ["get", "class"], "state"],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Italic"],
				"text-letter-spacing": 0.2,
				"text-max-width": 9,
				"text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 14],
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
			id: "label_city",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 3,
			filter: [
				"all",
				["==", ["get", "class"], "city"],
				["!=", ["get", "capital"], 2],
			],
			layout: {
				"icon-allow-overlap": true,
				"icon-image": ["step", ["zoom"], "circle_11_black", 9, ""],
				"icon-optional": false,
				"icon-size": 0.4,
				"text-anchor": "bottom",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Regular"],
				"text-max-width": 8,
				"text-offset": [0, -0.1],
				"text-size": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					4,
					11,
					7,
					13,
					11,
					18,
				],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_city_capital",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 3,
			filter: [
				"all",
				["==", ["get", "class"], "city"],
				["==", ["get", "capital"], 2],
			],
			layout: {
				"icon-allow-overlap": true,
				"icon-image": ["step", ["zoom"], "circle_11_black", 9, ""],
				"icon-optional": false,
				"icon-size": 0.5,
				"text-anchor": "bottom",
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Bold"],
				"text-max-width": 8,
				"text-offset": [0, -0.2],
				"text-size": [
					"interpolate",
					["exponential", 1.2],
					["zoom"],
					4,
					12,
					7,
					14,
					11,
					20,
				],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_country_3",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			minzoom: 2,
			maxzoom: 9,
			filter: [
				"all",
				["==", ["get", "class"], "country"],
				[">=", ["get", "rank"], 3],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Bold"],
				"text-max-width": 6.25,
				"text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 7, 17],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_country_2",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 9,
			filter: [
				"all",
				["==", ["get", "class"], "country"],
				["==", ["get", "rank"], 2],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Bold"],
				"text-max-width": 6.25,
				"text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 5, 17],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "label_country_1",
			type: "symbol",
			source: "openmaptiles",
			"source-layer": "place",
			maxzoom: 9,
			filter: [
				"all",
				["==", ["get", "class"], "country"],
				["==", ["get", "rank"], 1],
			],
			layout: {
				"text-field": [
					"case",
					["has", "name:nonlatin"],
					["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
					["coalesce", ["get", "name_en"], ["get", "name"]],
				],
				"text-font": ["Noto Sans Bold"],
				"text-max-width": 6.25,
				"text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 17],
			},
			paint: {
				"text-color": PALETTE.label,
				"text-halo-blur": 1,
				"text-halo-color": PALETTE.halo,
				"text-halo-width": 1,
			},
		},
	],
} satisfies StyleSpecification;
