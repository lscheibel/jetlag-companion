import type { CatalogPoi } from "./poi";

/**
 * A handful of named places inside the starter map. Not OSM geometry — the
 * e2e suite and unit tests need known pins, and CI has no extract.
 *
 * Starter map: [13.29, 52.46]–[13.51, 52.57]. Spandau sits outside it so a
 * bbox filter has something to drop.
 */

export const BERLIN_FIXTURE_POIS: readonly CatalogPoi[] = [
	{
		id: "way/1001",
		name: "Pergamonmuseum",
		kind: "museum",
		lng: 13.3969,
		lat: 52.5212,
	},
	{
		id: "way/1002",
		name: "Staatsbibliothek",
		kind: "library",
		lng: 13.391,
		lat: 52.518,
	},
	{
		id: "way/1003",
		name: "Berliner Schloss",
		kind: "castle",
		lng: 13.4016,
		lat: 52.5174,
	},
	{
		id: "node/1004",
		name: "Liquidrom",
		kind: "water_park",
		lng: 13.379,
		lat: 52.503,
	},
	{
		id: "way/1005",
		name: "Volksbühne",
		kind: "theatre",
		lng: 13.4117,
		lat: 52.5268,
	},
	{
		id: "way/1006",
		name: "Olympiastadion",
		kind: "stadium",
		lng: 13.2394,
		lat: 52.5147,
	},
	{
		id: "way/1007",
		name: "Charité",
		kind: "hospital",
		lng: 13.377,
		lat: 52.525,
	},
	{
		id: "node/1008",
		name: "Deutsche Guggenheim",
		kind: "gallery",
		lng: 13.3905,
		lat: 52.5165,
	},
	{
		id: "way/1009",
		name: "Kino International",
		kind: "cinema",
		lng: 13.4196,
		lat: 52.5206,
	},
	{
		id: "way/1010",
		name: "Zoo Berlin",
		kind: "zoo",
		lng: 13.337,
		lat: 52.508,
	},
	{
		id: "way/1011",
		name: "Blub",
		kind: "theme_park",
		lng: 13.45,
		lat: 52.48,
	},
	{
		id: "way/1012",
		name: "AquaDom",
		kind: "aquarium",
		lng: 13.4035,
		lat: 52.5198,
	},
	{
		id: "way/1013",
		name: "Großer Tiergarten",
		kind: "park",
		lng: 13.359,
		lat: 52.514,
	},
	{
		id: "node/1014",
		name: "Teufelsberg",
		kind: "mountain",
		lng: 13.241,
		lat: 52.497,
	},
	{
		id: "way/1015",
		name: "Golf- und Land-Club Berlin-Wannsee",
		kind: "golf_course",
		lng: 13.164,
		lat: 52.426,
	},
	{
		id: "way/1016",
		name: "Generalkonsulat der Vereinigten Staaten",
		kind: "consulate",
		lng: 13.372,
		lat: 52.508,
	},
];
