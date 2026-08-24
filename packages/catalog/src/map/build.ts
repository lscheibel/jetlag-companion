import { regionToMultiPolygon } from "@zero-lag/geo";
import type {
	ScalePreset,
	Selection,
	StoredMultiPolygon,
} from "@zero-lag/schema";
import { materialiseStops } from "../stops/materialise";
import type { ModeId } from "../stops/modes";
import { SCALE_SETTINGS } from "../stops/scale";
import type {
	CatalogStop,
	MaterialisedStop,
	StopCatalog,
} from "../stops/types";
import { mapContentHash } from "./content-hash";
import { areaFromSelection } from "./pieces";

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
	/**
	 * Which modes count as transit, or undefined for all of them.
	 *
	 * A stop survives if it is served by any selected mode. Undefined rather
	 * than the full list, because "everything" and "these eight" are different
	 * statements: the first keeps a mode the feed grows later, the second
	 * silently excludes it.
	 */
	readonly modeIds?: readonly ModeId[];
}

export interface BuiltMap {
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly selection: Selection;
	readonly hidingRadiusMeters: number;
	readonly modeIds: readonly ModeId[] | null;
	readonly validHidingArea: StoredMultiPolygon;
	readonly catalogVersion: string;
	readonly contentHash: string;
	readonly stops: readonly MaterialisedStop[];
}

export function buildMap(draft: MapDraft, catalog: StopCatalog): BuiltMap {
	const settings = SCALE_SETTINGS[draft.scalePreset];
	const hidingRadiusMeters =
		draft.hidingRadiusMeters ?? settings.hidingRadiusMeters;

	// The host's own vertices are what `selection` keeps; the repaired fold is
	// what the game is played on. They differ whenever a drawn ring crosses
	// itself, or when composed pieces union and cut each other.
	const area = areaFromSelection(draft.selection);
	const validHidingArea = regionToMultiPolygon(area);

	const modeIds = draft.modeIds ? [...draft.modeIds].sort() : null;
	const map = {
		name: draft.name,
		scalePreset: draft.scalePreset,
		selection: draft.selection,
		hidingRadiusMeters,
		validHidingArea,
		catalogVersion: catalog.version,
		modeIds,
	};

	return {
		...map,
		contentHash: mapContentHash(map),
		stops: materialiseStops(
			inSelectedModes(catalog.stops, modeIds),
			area,
			settings.marginMeters,
		),
	};
}

function inSelectedModes(
	stops: readonly CatalogStop[],
	modeIds: readonly ModeId[] | null,
): readonly CatalogStop[] {
	if (!modeIds) return stops;
	const wanted = new Set<string>(modeIds);
	return stops.filter((stop) => stop.modeIds.some((id) => wanted.has(id)));
}

/** A drawn ring, as `selection` stores it. */
export function drawnSelection(
	ring: readonly (readonly [number, number])[],
): Selection {
	return { kind: "drawn", polygon: [[ring]] };
}
