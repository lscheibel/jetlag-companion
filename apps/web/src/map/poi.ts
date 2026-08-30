import type { ModeId, PoiKind } from "@zero-lag/catalog";
import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { MODE_ORDER } from "../setup/modes";
import { isStationType, type PoiTypeId } from "./poi-type";
import type { SearchableStop } from "./toolkit";

/**
 * Fill colours for OSM amenity dots. Distinct from the stop paint (ink / pale
 * on dark) so a museum never reads as a station. Palette values, not roles:
 * MapLibre circle layers cannot take CSS variables, and the stop layer already
 * hardcodes hex the same way.
 */
export const POI_KIND_COLORS: Readonly<Record<PoiKind, string>> = {
	museum: "#cc79a7",
	library: "#0072b2",
	castle: "#4b4b4b",
	water_park: "#56b4e9",
	theatre: "#c13f94",
	stadium: "#d55e00",
	hospital: "#c7300f",
	gallery: "#e86bb4",
	cinema: "#0f5fc2",
	zoo: "#009e73",
	theme_park: "#e69f00",
	aquarium: "#00794a",
	park: "#5b8c3e",
	mountain: "#7a5a3a",
	golf_course: "#b5c44a",
	consulate: "#4a4e8c",
};

export interface MapPoi {
	readonly id: string;
	readonly name: string;
	readonly kind: PoiTypeId;
	readonly lng: number;
	readonly lat: number;
	readonly insideArea: boolean;
}

export interface PoiLayerState {
	/**
	 * Which station types to plot, or null for every one of them.
	 *
	 * Null rather than the full list, the same distinction the setup step
	 * draws: "everything" keeps a mode the board turns out to carry outside the
	 * area, "these five" would quietly drop it.
	 */
	readonly modes: readonly ModeId[] | null;
	readonly kinds: readonly PoiKind[];
}

export const DEFAULT_POI_LAYERS: PoiLayerState = {
	modes: null,
	kinds: [],
};

/** Every station type the board actually carries, in signage order. */
export function boardStopModes(
	stops: readonly SearchableStop[],
): readonly ModeId[] {
	const present = new Set<string>();
	for (const stop of stops) {
		for (const modeId of stop.modeIds) present.add(modeId);
	}
	return MODE_ORDER.filter((modeId) => present.has(modeId));
}

export function poiModeOn(state: PoiLayerState, modeId: ModeId): boolean {
	return state.modes === null || state.modes.includes(modeId);
}

/**
 * Turning one station type off is what turns the filter on. Turning the last
 * one back on returns the layer to "everything" rather than to a list that
 * happens to name them all.
 */
export function togglePoiMode(
	state: PoiLayerState,
	modeId: ModeId,
	available: readonly ModeId[],
): PoiLayerState {
	const selected = new Set<ModeId>(state.modes ?? available);
	if (selected.has(modeId)) selected.delete(modeId);
	else selected.add(modeId);
	if (available.every((id) => selected.has(id)))
		return { ...state, modes: null };
	return { ...state, modes: available.filter((id) => selected.has(id)) };
}

/** The stops the play map draws and lets you tap. A view filter, not a rule. */
export function stopsForModes(
	stops: readonly SearchableStop[],
	modes: readonly ModeId[] | null,
): readonly SearchableStop[] {
	if (modes === null) return stops;
	if (modes.length === 0) return [];
	const wanted = new Set<string>(modes);
	return stops.filter((stop) => stop.modeIds.some((id) => wanted.has(id)));
}

/**
 * Stations as points of interest — one pin per station *per station type*, so
 * "the nearest U-Bahn station" and "the nearest bus stop" are separate
 * questions at a hub that is both. The dots themselves are still drawn by the
 * stop layer; these are what the picking tools measure over.
 */
export function stationPois(
	stops: readonly SearchableStop[],
): readonly MapPoi[] {
	const out: MapPoi[] = [];
	for (const stop of stops) {
		for (const modeId of stop.modeIds) {
			if (!isStationType(modeId)) continue;
			out.push(stationPoi(stop, modeId));
		}
	}
	return out;
}

/** One station, as the pin for one of the types it serves. */
export function stationPoi(stop: SearchableStop, modeId: ModeId): MapPoi {
	return {
		id: `${STATION_POI_PREFIX}${modeId}:${stop.stopId}`,
		name: stop.name,
		kind: modeId,
		lng: stop.lng,
		lat: stop.lat,
		insideArea: stop.insideArea,
	};
}

const STATION_POI_PREFIX = "stop:";

/** The station a station pin stands for, or null for an amenity pin. */
export function stopIdOfPoi(poi: MapPoi): string | null {
	if (!poi.id.startsWith(STATION_POI_PREFIX)) return null;
	const rest = poi.id.slice(STATION_POI_PREFIX.length);
	const cut = rest.indexOf(":");
	return cut === -1 ? null : rest.slice(cut + 1);
}

export function togglePoiKind(
	state: PoiLayerState,
	kind: PoiKind,
): PoiLayerState {
	const on = state.kinds.includes(kind);
	return {
		...state,
		kinds: on
			? state.kinds.filter((item) => item !== kind)
			: [...state.kinds, kind],
	};
}

/** Turn a kind on without turning any other kind off. */
export function ensurePoiKind(
	state: PoiLayerState,
	kind: PoiKind,
): PoiLayerState {
	if (state.kinds.includes(kind)) return state;
	return { ...state, kinds: [...state.kinds, kind] };
}

/** Turn a station type on without turning any other one off. */
export function ensurePoiMode(
	state: PoiLayerState,
	modeId: ModeId,
): PoiLayerState {
	if (poiModeOn(state, modeId)) return state;
	const selected = new Set<ModeId>([...(state.modes ?? []), modeId]);
	return { ...state, modes: MODE_ORDER.filter((id) => selected.has(id)) };
}

/**
 * Plot whatever a picking tool just aimed at. A tool that filters to a type
 * nobody has switched on would otherwise ask the player to pick a pin off an
 * empty map.
 */
export function ensurePoiType(
	state: PoiLayerState,
	id: PoiTypeId,
): PoiLayerState {
	return isStationType(id)
		? ensurePoiMode(state, id)
		: ensurePoiKind(state, id);
}

/**
 * Voronoi generators for a nearest-POI constraint: the picked site, plus every
 * other same-kind pin that sits inside the game area. Outside pins are ignored
 * even when they are plotted, so a zoo beyond the fence does not steal a cell.
 */
export function closestPoiSites(
	selected: MapPoi,
	pois: readonly MapPoi[],
): {
	readonly selected: MapPoi;
	readonly others: readonly MapPoi[];
} {
	const others = pois.filter(
		(poi) =>
			poi.id !== selected.id && poi.kind === selected.kind && poi.insideArea,
	);
	return { selected, others };
}

/**
 * Radius the nearest-POI draft starts at: the seeker's distance to the pin,
 * or null when there is no fix (or they are standing on it).
 */
export function defaultClosestPoiRadius(
	fromYou: LngLat | null,
	lng: number,
	lat: number,
): number | null {
	if (!fromYou) return null;
	const meters = distanceMeters(fromYou, [lng, lat]);
	return meters > 0 ? meters : null;
}

/**
 * Circles for a radius constraint on every POI of a kind. Same fence as
 * nearest-cell sites: only pins inside the valid hiding area.
 */
export function radiusPoiCenters(
	kind: PoiTypeId,
	pois: readonly MapPoi[],
): readonly LngLat[] {
	return pois
		.filter((poi) => poi.kind === kind && poi.insideArea)
		.map((poi) => [poi.lng, poi.lat] as const);
}
