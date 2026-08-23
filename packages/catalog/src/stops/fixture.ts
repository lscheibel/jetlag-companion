import { stopCatalogVersion } from "../map/content-hash";
import type { CatalogStop, StopCatalog } from "./types";

/**
 * Twelve Berlin stations, carried over from the M0 area pack. m4-spec §4.
 *
 * The pack concept is gone; this survived it, because a test that asserts on
 * geometry wants twelve stations and a square rather than a 22 MB file and a
 * database. What went is every import of it from a play screen — a game's stops
 * come from `mapStop` now, and this exists for unit tests and for an e2e suite
 * that cannot build the real catalog in CI.
 */

const BERLIN_STOPS: CatalogStop[] = [
	{
		id: "alexanderplatz",
		name: "Alexanderplatz",
		lng: 13.4132,
		lat: 52.5219,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "friedrichstrasse",
		name: "Friedrichstraße",
		lng: 13.3872,
		lat: 52.52,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "gesundbrunnen",
		name: "Gesundbrunnen",
		lng: 13.3886,
		lat: 52.5486,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "hauptbahnhof",
		name: "Hauptbahnhof",
		lng: 13.3694,
		lat: 52.525,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "hermannplatz",
		name: "Hermannplatz",
		lng: 13.4244,
		lat: 52.4869,
		modeIds: ["u-bahn"],
	},
	{
		id: "ostkreuz",
		name: "Ostkreuz",
		lng: 13.469,
		lat: 52.503,
		modeIds: ["s-bahn"],
	},
	{
		id: "potsdamer-platz",
		name: "Potsdamer Platz",
		lng: 13.376,
		lat: 52.5096,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "schoenhauser-allee",
		name: "Schönhauser Allee",
		lng: 13.4128,
		lat: 52.5493,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "suedkreuz",
		name: "Südkreuz",
		lng: 13.3654,
		lat: 52.4757,
		modeIds: ["s-bahn"],
	},
	{
		id: "warschauer-strasse",
		name: "Warschauer Straße",
		lng: 13.449,
		lat: 52.505,
		modeIds: ["s-bahn", "u-bahn"],
	},
	{
		id: "westkreuz",
		name: "Westkreuz",
		lng: 13.2836,
		lat: 52.5013,
		modeIds: ["s-bahn"],
	},
	{
		id: "zoologischer-garten",
		name: "Zoologischer Garten",
		lng: 13.3327,
		lat: 52.5073,
		modeIds: ["s-bahn", "u-bahn"],
	},
];

/** Hashed the same way the real build hashes its output, for the same reason. */
export const BERLIN_FIXTURE_CATALOG: StopCatalog = {
	version: `fixture-${stopCatalogVersion(BERLIN_STOPS).slice(0, 12)}`,
	feedPublisher: "Berlin fixture (not a feed)",
	builtAt: 0,
	stops: BERLIN_STOPS,
};
