import {
	buildValidHidingArea,
	drawnSelection,
	SCALE_SETTINGS,
	suggestScalePreset,
} from "@zero-lag/catalog";
import {
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	regionArea,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import type { ScalePreset } from "@zero-lag/schema";
import { useMemo, useState } from "react";

/**
 * What a builder session is. m4-spec §9.
 *
 * Everything below the ring is *derived* rather than stored: the area, its
 * size, the suggested preset and the radius all fall out of the vertices on
 * every render. There is no effect keeping them in step because there is
 * nothing to keep in step — a ring is the only state a draw has.
 */

export interface BuilderState {
	readonly ring: readonly LngLat[];
	readonly drawing: boolean;
	readonly name: string;
	/** Null until the host overrides it; the suggestion applies meanwhile. */
	readonly presetOverride: ScalePreset | null;
	readonly radiusOverride: number | null;
}

const EMPTY: BuilderState = {
	ring: [],
	drawing: true,
	name: "",
	presetOverride: null,
	radiusOverride: null,
};

export interface Builder {
	readonly state: BuilderState;
	readonly area: MultiPolygon | null;
	readonly areaSquareMeters: number;
	readonly scalePreset: ScalePreset;
	/** What the area's own extent suggests, whether or not the host took it. */
	readonly suggestedPreset: ScalePreset;
	readonly hidingRadiusMeters: number;
	readonly canSave: boolean;
	addVertex: (point: LngLat) => void;
	setRing: (ring: readonly LngLat[]) => void;
	undoVertex: () => void;
	clear: () => void;
	setDrawing: (drawing: boolean) => void;
	setName: (name: string) => void;
	setPreset: (preset: ScalePreset) => void;
	setRadius: (meters: number) => void;
	load: (input: {
		ring: readonly LngLat[];
		name: string;
		preset: ScalePreset;
		radiusMeters: number;
	}) => void;
}

export function useBuilder(): Builder {
	const [state, setState] = useState<BuilderState>(EMPTY);

	const region = useMemo(
		() => (state.ring.length >= 3 ? buildValidHidingArea(state.ring) : null),
		[state.ring],
	);
	const area = region ? regionToMultiPolygon(region) : null;
	const bbox = area ? multiPolygonBBox(area) : null;

	const suggested = bbox ? suggestScalePreset(bbox) : "city";
	const scalePreset = state.presetOverride ?? suggested;
	const hidingRadiusMeters =
		state.radiusOverride ?? SCALE_SETTINGS[scalePreset].hidingRadiusMeters;

	return {
		state,
		area,
		areaSquareMeters: region ? regionArea(region) : 0,
		scalePreset,
		suggestedPreset: suggested,
		hidingRadiusMeters,
		canSave: (area?.length ?? 0) > 0 && state.name.trim().length > 0,
		addVertex: (point) =>
			setState((current) => ({ ...current, ring: [...current.ring, point] })),
		setRing: (ring) => setState((current) => ({ ...current, ring })),
		undoVertex: () =>
			setState((current) => ({ ...current, ring: current.ring.slice(0, -1) })),
		clear: () => setState((current) => ({ ...EMPTY, name: current.name })),
		setDrawing: (drawing) => setState((current) => ({ ...current, drawing })),
		setName: (name) => setState((current) => ({ ...current, name })),
		setPreset: (preset) =>
			setState((current) => ({ ...current, presetOverride: preset })),
		setRadius: (meters) =>
			setState((current) => ({ ...current, radiusOverride: meters })),
		load: (input) =>
			setState({
				ring: input.ring,
				drawing: false,
				name: input.name,
				presetOverride: input.preset,
				radiusOverride: input.radiusMeters,
			}),
	};
}

export function formatArea(squareMeters: number): string {
	const km2 = squareMeters / 1_000_000;
	if (km2 < 1) return `${Math.round(squareMeters / 10_000) / 100} km²`;
	if (km2 < 100) return `${km2.toFixed(1)} km²`;
	return `${Math.round(km2).toLocaleString()} km²`;
}
