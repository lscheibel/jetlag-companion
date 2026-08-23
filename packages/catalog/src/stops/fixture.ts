import { stopCatalogVersion } from "../map/content-hash";
import { modeIdsFromLines } from "./lines";
import type { CatalogStop, StopCatalog, StopLine } from "./types";

/**
 * Twelve Berlin stations, carried over from the M0 area pack. m4-spec §4.
 *
 * The pack concept is gone; this survived it, because a test that asserts on
 * geometry wants twelve stations and a square rather than a 22 MB file and a
 * database. What went is every import of it from a play screen — a game's stops
 * come from `mapStop` now, and this exists for unit tests and for an e2e suite
 * that cannot build the real catalog in CI.
 */

function station(
	id: string,
	name: string,
	lng: number,
	lat: number,
	lines: readonly StopLine[],
): CatalogStop {
	return { id, name, lng, lat, lines, modeIds: modeIdsFromLines(lines) };
}

const BERLIN_STOPS: CatalogStop[] = [
	station("alexanderplatz", "Alexanderplatz", 13.4132, 52.5219, [
		{ name: "U2", modeId: "u-bahn" },
		{ name: "U5", modeId: "u-bahn" },
		{ name: "U8", modeId: "u-bahn" },
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
		{ name: "100", modeId: "bus" },
		{ name: "200", modeId: "bus" },
	]),
	station("friedrichstrasse", "Friedrichstraße", 13.3872, 52.52, [
		{ name: "U6", modeId: "u-bahn" },
		{ name: "S1", modeId: "s-bahn" },
		{ name: "S2", modeId: "s-bahn" },
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
	]),
	station("gesundbrunnen", "Gesundbrunnen", 13.3886, 52.5486, [
		{ name: "U8", modeId: "u-bahn" },
		{ name: "S1", modeId: "s-bahn" },
		{ name: "S2", modeId: "s-bahn" },
		{ name: "S25", modeId: "s-bahn" },
		{ name: "S26", modeId: "s-bahn" },
	]),
	station("hauptbahnhof", "Hauptbahnhof", 13.3694, 52.525, [
		{ name: "U5", modeId: "u-bahn" },
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
		{ name: "RE1", modeId: "regional" },
		{ name: "RE2", modeId: "regional" },
		{ name: "ICE 599", modeId: "long-distance" },
	]),
	station("hermannplatz", "Hermannplatz", 13.4244, 52.4869, [
		{ name: "U7", modeId: "u-bahn" },
		{ name: "U8", modeId: "u-bahn" },
		{ name: "M29", modeId: "bus" },
	]),
	station("ostkreuz", "Ostkreuz", 13.469, 52.503, [
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S75", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
	]),
	station("potsdamer-platz", "Potsdamer Platz", 13.376, 52.5096, [
		{ name: "U2", modeId: "u-bahn" },
		{ name: "S1", modeId: "s-bahn" },
		{ name: "S2", modeId: "s-bahn" },
		{ name: "S25", modeId: "s-bahn" },
		{ name: "S26", modeId: "s-bahn" },
	]),
	station("schoenhauser-allee", "Schönhauser Allee", 13.4128, 52.5493, [
		{ name: "U2", modeId: "u-bahn" },
		{ name: "S8", modeId: "s-bahn" },
		{ name: "S41", modeId: "s-bahn" },
		{ name: "S42", modeId: "s-bahn" },
		{ name: "M1", modeId: "tram" },
	]),
	station("suedkreuz", "Südkreuz", 13.3654, 52.4757, [
		{ name: "S2", modeId: "s-bahn" },
		{ name: "S25", modeId: "s-bahn" },
		{ name: "S26", modeId: "s-bahn" },
		{ name: "S41", modeId: "s-bahn" },
		{ name: "S42", modeId: "s-bahn" },
	]),
	station("warschauer-strasse", "Warschauer Straße", 13.449, 52.505, [
		{ name: "U1", modeId: "u-bahn" },
		{ name: "U3", modeId: "u-bahn" },
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
		{ name: "M10", modeId: "tram" },
	]),
	station("westkreuz", "Westkreuz", 13.2836, 52.5013, [
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
		{ name: "S41", modeId: "s-bahn" },
		{ name: "S42", modeId: "s-bahn" },
	]),
	station("zoologischer-garten", "Zoologischer Garten", 13.3327, 52.5073, [
		{ name: "U2", modeId: "u-bahn" },
		{ name: "U9", modeId: "u-bahn" },
		{ name: "S3", modeId: "s-bahn" },
		{ name: "S5", modeId: "s-bahn" },
		{ name: "S7", modeId: "s-bahn" },
		{ name: "S9", modeId: "s-bahn" },
		{ name: "100", modeId: "bus" },
	]),
];

/** Hashed the same way the real build hashes its output, for the same reason. */
export const BERLIN_FIXTURE_CATALOG: StopCatalog = {
	version: `fixture-${stopCatalogVersion(BERLIN_STOPS).slice(0, 12)}`,
	feedPublisher: "Berlin fixture (not a feed)",
	builtAt: 0,
	stops: BERLIN_STOPS,
};
