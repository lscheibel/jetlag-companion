import {
	BERLIN_PROJECTION,
	circleRegion,
	createProjector,
	EMPTY_REGION,
	type Meters,
	normalizeRegion,
	type Region,
	regionToMultiPolygon,
	unionRegions,
} from "@zero-lag/geo";
import { areaPackContentHash, mapConfigContentHash } from "../content-hash";
import type { AreaPack, MapConfig } from "../types";

/**
 * The M0 fixture: a hand-written slice of Berlin/VBB, not a real pack.
 *
 * M0 is explicitly out of scope for the area builder — this exists so the
 * constraint engine has a seed area to fold over and the Playwright suite has
 * something stable to assert against. M4 replaces it with a generated pack.
 */

const HIDING_RADIUS_BY_MODE: Record<string, Meters> = {
	"s-bahn": 1000,
	"u-bahn": 800,
};

const basePack: Omit<AreaPack, "contentHash"> = {
	id: "berlin-vbb",
	version: "0.1.0",
	name: "Berlin — VBB (M0 fixture)",
	projection: BERLIN_PROJECTION,
	bounds: [13.2, 52.4, 13.6, 52.6],
	modes: [
		{ id: "s-bahn", name: "S-Bahn" },
		{ id: "u-bahn", name: "U-Bahn" },
	],
	stops: [
		{
			id: "alexanderplatz",
			name: "Alexanderplatz",
			position: [13.4132, 52.5219],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "hauptbahnhof",
			name: "Hauptbahnhof",
			position: [13.3694, 52.525],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "zoologischer-garten",
			name: "Zoologischer Garten",
			position: [13.3327, 52.5073],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "friedrichstrasse",
			name: "Friedrichstraße",
			position: [13.3872, 52.52],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "potsdamer-platz",
			name: "Potsdamer Platz",
			position: [13.376, 52.5096],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "ostkreuz",
			name: "Ostkreuz",
			position: [13.469, 52.503],
			modeIds: ["s-bahn"],
		},
		{
			id: "warschauer-strasse",
			name: "Warschauer Straße",
			position: [13.449, 52.505],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "gesundbrunnen",
			name: "Gesundbrunnen",
			position: [13.3886, 52.5486],
			modeIds: ["s-bahn", "u-bahn"],
		},
		{
			id: "suedkreuz",
			name: "Südkreuz",
			position: [13.3654, 52.4757],
			modeIds: ["s-bahn"],
		},
		{
			id: "westkreuz",
			name: "Westkreuz",
			position: [13.2836, 52.5013],
			modeIds: ["s-bahn"],
		},
		{
			id: "hermannplatz",
			name: "Hermannplatz",
			position: [13.4244, 52.4869],
			modeIds: ["u-bahn"],
		},
		{
			id: "schoenhauser-allee",
			name: "Schönhauser Allee",
			position: [13.4128, 52.5493],
			modeIds: ["s-bahn", "u-bahn"],
		},
	],
	lines: [
		{
			id: "s41",
			modeId: "s-bahn",
			name: "S41 Ringbahn",
			stopIds: [
				"gesundbrunnen",
				"ostkreuz",
				"suedkreuz",
				"westkreuz",
				"schoenhauser-allee",
			],
		},
		{
			id: "u8",
			modeId: "u-bahn",
			name: "U8",
			stopIds: ["gesundbrunnen", "alexanderplatz", "hermannplatz"],
		},
		{
			id: "s3",
			modeId: "s-bahn",
			name: "S3",
			stopIds: [
				"westkreuz",
				"zoologischer-garten",
				"hauptbahnhof",
				"friedrichstrasse",
				"alexanderplatz",
				"warschauer-strasse",
				"ostkreuz",
			],
		},
	],
	boundaries: [
		{
			id: "mitte",
			name: "Mitte",
			polygons: [
				[
					[
						[13.34, 52.5],
						[13.44, 52.5],
						[13.44, 52.55],
						[13.34, 52.55],
						[13.34, 52.5],
					],
				],
			],
		},
	],
};

export const BERLIN_VBB_PACK: AreaPack = {
	...basePack,
	contentHash: areaPackContentHash(basePack),
};

/** The largest hiding radius any of a stop's modes grants it. */
function radiusForStop(modeIds: readonly string[]): Meters {
	return modeIds.reduce(
		(largest, modeId) => Math.max(largest, HIDING_RADIUS_BY_MODE[modeId] ?? 0),
		0,
	);
}

/**
 * What a builder session would emit: the union of each enabled stop's disc.
 *
 * A real config is hand-edited after this point, which is exactly why
 * `validHidingArea` is stored on the config rather than recomputed from the
 * stop list. This function runs once, here, and its output is the stored value.
 */
function buildValidHidingArea(enabledStopIds: readonly string[]): Region {
	const projector = createProjector(BERLIN_PROJECTION);
	const enabled = new Set(enabledStopIds);
	let area = EMPTY_REGION;
	for (const stop of BERLIN_VBB_PACK.stops) {
		if (!enabled.has(stop.id)) continue;
		area = unionRegions(
			area,
			circleRegion(
				projector.forward(stop.position),
				radiusForStop(stop.modeIds),
			),
		);
	}
	return normalizeRegion(area, BERLIN_PROJECTION);
}

export function berlinFixtureMapConfig(
	gameId: string,
	id = `mapcfg-${gameId}`,
): MapConfig {
	const enabledStopIds = BERLIN_VBB_PACK.stops.map((stop) => stop.id);
	const projector = createProjector(BERLIN_PROJECTION);
	const base: Omit<MapConfig, "contentHash"> = {
		id,
		gameId,
		areaPackId: BERLIN_VBB_PACK.id,
		areaPackVersion: BERLIN_VBB_PACK.version,
		projection: BERLIN_PROJECTION,
		validHidingArea: regionToMultiPolygon(
			buildValidHidingArea(enabledStopIds),
			projector,
		),
		enabledStopIds,
		hidingRadiusByMode: HIDING_RADIUS_BY_MODE,
	};
	return { ...base, contentHash: mapConfigContentHash(base) };
}

export { HIDING_RADIUS_BY_MODE };
