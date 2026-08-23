import { contentHash, type JsonValue, type MultiPolygon } from "@zero-lag/geo";
import type { ScalePreset, Selection } from "@zero-lag/schema";
import type { CatalogStop } from "../stops/types";

/**
 * Hashes cover everything that changes what a thing *means*, and nothing else.
 * The hash field itself is always excluded, or it could never be computed.
 */

function polygonsToJson(
	polygons: MultiPolygon,
): readonly (readonly (readonly (readonly number[])[])[])[] {
	return polygons.map((polygon) =>
		polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
	);
}

function selectionToJson(selection: Selection): JsonValue {
	return { kind: selection.kind, polygon: polygonsToJson(selection.polygon) };
}

/**
 * The catalog's version. m4-spec §4.
 *
 * Stops arrive in id order, so this is a function of the feed alone: rebuilding
 * over the same feed produces the same version, and there is no separate
 * registry to keep in step with the file.
 */
export function stopCatalogVersion(stops: readonly CatalogStop[]): string {
	return contentHash(
		stops.map((stop) => ({
			id: stop.id,
			name: stop.name,
			lng: stop.lng,
			lat: stop.lat,
			modeIds: [...stop.modeIds],
		})),
	);
}

export interface HashableMap {
	readonly catalogVersion: string;
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly selection: Selection;
	readonly validHidingArea: MultiPolygon;
	readonly hidingRadiusMeters: number;
}

/**
 * The identity of a map, shared by `mapConfig` and `mapTemplate` because they
 * are the same artifact wearing different hats — which is what lets §7's share
 * code reproduce a map byte-identically and lets the recipient check it.
 *
 * Provenance columns are excluded: `id`, `gameId`, `sourceTemplateId` and
 * `supersedesConfigId` say where a map came from, not what it is.
 *
 * `name` *is* included, so renaming moves the hash. This costs a needless
 * refold of every search area on a rename, which is rare and cheap, and buys a
 * hash that means "this is the same map" rather than "this folds the same way".
 */
export function mapContentHash(map: HashableMap): string {
	return contentHash({
		catalogVersion: map.catalogVersion,
		name: map.name,
		scalePreset: map.scalePreset,
		selection: selectionToJson(map.selection),
		validHidingArea: polygonsToJson(map.validHidingArea),
		hidingRadiusMeters: map.hidingRadiusMeters,
	});
}
