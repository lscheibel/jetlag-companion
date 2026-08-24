import { type BuiltMap, buildMap, drawnSelection } from "@zero-lag/catalog";
import { loadCatalog } from "./catalog";
import { drizzleSchema } from "./db";

/** Nine columns per row, comfortably inside Postgres's 65,535 parameter cap. */
const STOP_INSERT_CHUNK = 1_000;

type Tx = Parameters<Parameters<typeof import("./db").db.transaction>[0]>[0];

/**
 * Writing a board into a game: the config row, its stops and the event, always
 * together. m4-spec §7, §8.
 */

export interface WriteMapOptions {
	readonly gameId: string;
	readonly map: BuiltMap;
	readonly sourceTemplateId: string | null;
	/** Set when this replaces a board a game already had. m4-spec §8. */
	readonly supersedesConfigId: string | null;
}

export async function writeMapConfig(
	tx: Tx,
	options: WriteMapOptions,
): Promise<string> {
	const { gameId, map } = options;
	const mapConfigId = crypto.randomUUID();

	await tx.insert(drizzleSchema.mapConfig).values({
		id: mapConfigId,
		gameId,
		catalogVersion: map.catalogVersion,
		name: map.name,
		scalePreset: map.scalePreset,
		selection: map.selection,
		validHidingArea: map.validHidingArea,
		hidingRadiusMeters: map.hidingRadiusMeters,
		modeIds: map.modeIds ? [...map.modeIds] : null,
		sourceTemplateId: options.sourceTemplateId,
		supersedesConfigId: options.supersedesConfigId,
		contentHash: map.contentHash,
	});

	const rows = map.stops.map((stop) => ({
		id: `${mapConfigId}:${stop.stopId}`,
		mapConfigId,
		stopId: stop.stopId,
		name: stop.name,
		lng: stop.lng,
		lat: stop.lat,
		modeIds: [...stop.modeIds],
		lines: stop.lines.map((line) => ({
			name: line.name,
			modeId: line.modeId,
		})),
		insideArea: stop.insideArea,
	}));

	/**
	 * Chunked, because a single statement binds one parameter per column per row
	 * and Postgres stops at 65,535 of them. At nine columns that is a ceiling of
	 * 7,281 stops — which a `state` map (7,791 in the test that found this) slips
	 * under only after chunking, and a `ticket` map does not without it.
	 *
	 * The build plan's sequencing note says to test the extremes early for
	 * exactly this reason: a nationwide map is not a bigger version of a city
	 * one, it is the case where a different limit applies.
	 */
	for (let i = 0; i < rows.length; i += STOP_INSERT_CHUNK) {
		await tx
			.insert(drizzleSchema.mapStop)
			.values(rows.slice(i, i + STOP_INSERT_CHUNK));
	}

	return mapConfigId;
}

/** Neither event carries the geometry — `contentHash` is the full state. m4-spec §10. */
export function mapEventPayload(mapConfigId: string, map: BuiltMap) {
	return {
		mapConfigId,
		name: map.name,
		scalePreset: map.scalePreset,
		hidingRadiusMeters: map.hidingRadiusMeters,
		stopCount: map.stops.length,
		catalogVersion: map.catalogVersion,
		contentHash: map.contentHash,
	};
}

/**
 * The board a game opens with. m4-spec §9's builder replaces it.
 *
 * A new game needs *a* board or the map, hiding and question screens have
 * nothing to draw, and the least surprising board is the one around the city
 * this is seeded with. It is a real map built from the real catalog — not the
 * old fixture wearing a new hat — and the host is expected to redraw it.
 */
export function starterMap(): BuiltMap {
	return buildMap(
		{
			// A player-facing name: this is what the lobby header and the briefing
			// call the game, and "starter map" is builder vocabulary rather than
			// anything a player agreed to play on.
			name: "All of Berlin",
			scalePreset: "city",
			selection: drawnSelection([
				[13.29, 52.46],
				[13.51, 52.46],
				[13.51, 52.57],
				[13.29, 52.57],
				[13.29, 52.46],
			]),
		},
		loadCatalog(),
	);
}
