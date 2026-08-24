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

/**
 * Every ring as its own LineString — including holes. A line layer on a
 * Polygon only paints the outer edge, which is how a cut used to vanish.
 */
export function multiPolygonOutlines(multi: MultiPolygon | null): FeatureData {
	if (!multi || multi.length === 0) return EMPTY_FEATURES;
	const features: {
		type: "Feature";
		properties: Record<string, never>;
		geometry: { type: "LineString"; coordinates: number[][] };
	}[] = [];
	for (const polygon of multi) {
		for (const ring of polygon) {
			if (ring.length < 2) continue;
			const coords: number[][] = ring.map(([lng, lat]) => [lng, lat]);
			const first = coords[0];
			const last = coords[coords.length - 1];
			if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
				coords.push(first);
			}
			features.push({
				type: "Feature",
				properties: {},
				geometry: { type: "LineString", coordinates: coords },
			});
		}
	}
	return { type: "FeatureCollection", features };
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
