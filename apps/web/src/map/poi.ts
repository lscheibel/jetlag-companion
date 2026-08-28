import type { PoiKind } from "@zero-lag/catalog";
import { distanceMeters, type LngLat } from "@zero-lag/geo";

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
	readonly kind: PoiKind;
	readonly lng: number;
	readonly lat: number;
	readonly insideArea: boolean;
}

export interface PoiLayerState {
	readonly transit: boolean;
	readonly kinds: readonly PoiKind[];
}

export const DEFAULT_POI_LAYERS: PoiLayerState = {
	transit: true,
	kinds: [],
};

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
