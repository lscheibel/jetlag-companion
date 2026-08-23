import { type BuiltMap, buildMap, drawnSelection } from "@zero-lag/catalog";
import { loadCatalog } from "./catalog";
import { drizzleSchema } from "./db";

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
		sourceTemplateId: options.sourceTemplateId,
		supersedesConfigId: options.supersedesConfigId,
		contentHash: map.contentHash,
	});

	if (map.stops.length > 0) {
		await tx.insert(drizzleSchema.mapStop).values(
			map.stops.map((stop) => ({
				id: `${mapConfigId}:${stop.stopId}`,
				mapConfigId,
				stopId: stop.stopId,
				name: stop.name,
				lng: stop.lng,
				lat: stop.lat,
				modeIds: [...stop.modeIds],
				insideArea: stop.insideArea,
			})),
		);
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
			name: "Berlin — starter map",
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
