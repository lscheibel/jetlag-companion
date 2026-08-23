import { regionToMultiPolygon } from "@zero-lag/geo";
import type {
	ScalePreset,
	Selection,
	StoredMultiPolygon,
} from "@zero-lag/schema";
import { materialiseStops } from "../stops/materialise";
import { SCALE_SETTINGS } from "../stops/scale";
import type { MaterialisedStop, StopCatalog } from "../stops/types";
import { buildValidHidingArea } from "./area";
import { mapContentHash } from "./content-hash";

/**
 * The single place a drawn ring becomes a board. m4-spec §3, §5, §7.
 *
 * Game creation, applying a template and saving one all run this, so the area
 * repair, the stop materialisation and the hash cannot drift between them —
 * which is what makes §7's promise hold: the same code applied on two devices
 * produces the same rows, the same geometry and the same hash by construction.
 */

export interface MapDraft {
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly selection: Selection;
	/** Defaults to the preset's radius when the host has not overridden it. */
	readonly hidingRadiusMeters?: number;
}

export interface BuiltMap {
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly selection: Selection;
	readonly hidingRadiusMeters: number;
	readonly validHidingArea: StoredMultiPolygon;
	readonly catalogVersion: string;
	readonly contentHash: string;
	readonly stops: readonly MaterialisedStop[];
}

export function buildMap(draft: MapDraft, catalog: StopCatalog): BuiltMap {
	const settings = SCALE_SETTINGS[draft.scalePreset];
	const hidingRadiusMeters =
		draft.hidingRadiusMeters ?? settings.hidingRadiusMeters;

	// The host's own vertices are what `selection` keeps; the repaired ring is
	// what the game is played on. They differ whenever a drawn ring crosses
	// itself, which is the case the pair exists for.
	const area = buildValidHidingArea(draft.selection.polygon[0]?.[0] ?? []);
	const validHidingArea = regionToMultiPolygon(area);

	const map = {
		name: draft.name,
		scalePreset: draft.scalePreset,
		selection: draft.selection,
		hidingRadiusMeters,
		validHidingArea,
		catalogVersion: catalog.version,
	};

	return {
		...map,
		contentHash: mapContentHash(map),
		stops: materialiseStops(catalog.stops, area, settings.marginMeters),
	};
}

/** A drawn ring, as `selection` stores it. */
export function drawnSelection(
	ring: readonly (readonly [number, number])[],
): Selection {
	return { kind: "drawn", polygon: [[ring]] };
}
