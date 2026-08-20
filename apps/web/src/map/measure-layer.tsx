import { circleLngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import {
	EMPTY_FEATURES,
	lineFeature,
	multiPolygonFeature,
	pointsFeature,
} from "./geojson";
import type { Measure } from "./toolkit";
import { useGeoJsonLayer } from "./use-geojson-layer";

const FILL_LAYERS = [
	{
		id: "measure-fill",
		type: "fill" as const,
		paint: { "fill-color": "#0072B2", "fill-opacity": 0.14 },
	},
];
const LINE_LAYERS = [
	{
		id: "measure-line",
		type: "line" as const,
		paint: { "line-color": "#0072B2", "line-width": 3 },
	},
];
const VERTEX_LAYERS = [
	{
		id: "measure-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffffff",
			"circle-radius": 5,
			"circle-stroke-color": "#0072B2",
			"circle-stroke-width": 2,
		},
	},
];

export function MeasureLayer({
	measure,
}: {
	readonly measure: Measure | null;
}) {
	const fill = useMemo(() => {
		if (measure?.kind !== "radius" || !measure.center) return EMPTY_FEATURES;
		return multiPolygonFeature(
			circleLngLat(measure.center, measure.radiusMeters),
		);
	}, [measure]);
	const line = useMemo(
		() =>
			measure?.kind === "path"
				? lineFeature(measure.points)
				: measure?.center
					? lineFeature([
							measure.center,
							circleLngLat(measure.center, measure.radiusMeters)[0]?.[0]?.[0] ??
								measure.center,
						])
					: EMPTY_FEATURES,
		[measure],
	);
	const points = useMemo(
		() =>
			measure?.kind === "path"
				? pointsFeature(measure.points)
				: measure?.center
					? pointsFeature([measure.center])
					: EMPTY_FEATURES,
		[measure],
	);

	useGeoJsonLayer("measure-fill-source", fill, FILL_LAYERS);
	useGeoJsonLayer("measure-line-source", line, LINE_LAYERS);
	useGeoJsonLayer("measure-vertices-source", points, VERTEX_LAYERS);
	return null;
}
