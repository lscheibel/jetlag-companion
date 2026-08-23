import { useMemo } from "react";
import type { FeatureData } from "./geojson";
import { EMPTY_FEATURES } from "./geojson";
import type { SearchableStop } from "./toolkit";
import { useGeoJsonLayer } from "./use-geojson-layer";

const LAYERS = [
	{
		id: "builder-stops",
		type: "circle" as const,
		paint: {
			"circle-radius": 4,
			"circle-color": [
				"case",
				["get", "insideArea"],
				"#1d4ed8",
				"#9ca3af",
			] as unknown as string,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 1,
		},
	},
];

interface BuilderStopsLayerProps {
	readonly stops: readonly SearchableStop[];
}

/**
 * Catalog stops in view, dimmed outside the area. m4-spec §9.
 *
 * Dimmed rather than hidden: a host judging whether a draw is a game needs to
 * see what it *nearly* caught, and stops just outside the line are exactly the
 * ones that make them drag a vertex.
 */
export function BuilderStopsLayer({ stops }: BuilderStopsLayerProps) {
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => ({
				type: "Feature",
				properties: { insideArea: stop.insideArea },
				geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
			})),
		};
	}, [stops]);
	useGeoJsonLayer("builder-stops", data, LAYERS);
	return null;
}
