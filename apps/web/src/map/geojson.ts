import type { MultiPolygon } from "@zero-lag/geo";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

/**
 * `packages/geo`'s readonly tuples into the mutable arrays MapLibre wants.
 *
 * One conversion, in one place, because the two shapes are close enough that a
 * second hand-rolled one would be written without noticing and would differ in
 * exactly the ring-winding way that is invisible until it is not.
 */
export type FeatureData = GeoJSONSourceSpecification["data"];

export const EMPTY_FEATURES: FeatureData = {
	type: "FeatureCollection",
	features: [],
};

export function multiPolygonFeature(multi: MultiPolygon | null): FeatureData {
	if (!multi || multi.length === 0) return EMPTY_FEATURES;
	return {
		type: "Feature",
		properties: {},
		geometry: {
			type: "MultiPolygon",
			coordinates: multi.map((polygon) =>
				polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
			),
		},
	};
}
