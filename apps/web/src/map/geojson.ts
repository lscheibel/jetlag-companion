import type { LngLat, MultiPolygon, Ring } from "@zero-lag/geo";
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

export function lineFeature(points: readonly LngLat[]): FeatureData {
	if (points.length < 2) return EMPTY_FEATURES;
	return {
		type: "Feature",
		properties: {},
		geometry: {
			type: "LineString",
			coordinates: points.map(([lng, lat]) => [lng, lat]),
		},
	};
}

export function ringsFeature(rings: readonly Ring[]): FeatureData {
	if (rings.length === 0) return EMPTY_FEATURES;
	return {
		type: "FeatureCollection",
		features: rings.map((ring) => ({
			type: "Feature",
			properties: {},
			geometry: {
				type: "Polygon",
				coordinates: [ring.map(([lng, lat]) => [lng, lat])],
			},
		})),
	};
}

export function pointsFeature(points: readonly LngLat[]): FeatureData {
	return {
		type: "FeatureCollection",
		features: points.map(([lng, lat]) => ({
			type: "Feature",
			properties: {},
			geometry: { type: "Point", coordinates: [lng, lat] },
		})),
	};
}
