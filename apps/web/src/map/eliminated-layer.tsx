import type { MultiPolygon, Region } from "@zero-lag/geo";
import { regionToMultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const FILL_LAYERS = [
	{
		id: "eliminated-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#111827",
			"fill-opacity": 0.45,
		},
	},
];

const OUTLINE_LAYERS = [
	{
		id: "surviving-outline",
		type: "line" as const,
		paint: {
			"line-color": "#111827",
			"line-width": 2,
			"line-opacity": 0.9,
		},
	},
];

interface EliminatedLayerProps {
	readonly eliminated: MultiPolygon | null;
	readonly surviving: Region | null;
}

/**
 * Everything outside the surviving search area, including outside the game
 * area. The dashed game-area outline stays; this is the fill that gives it
 * meaning.
 */
export function EliminatedLayer({
	eliminated,
	surviving,
}: EliminatedLayerProps) {
	const fill = useMemo(() => multiPolygonFeature(eliminated), [eliminated]);
	const outline = useMemo(
		() =>
			multiPolygonFeature(
				surviving ? regionToMultiPolygon(surviving) : null,
			),
		[surviving],
	);
	useGeoJsonLayer("eliminated", fill, FILL_LAYERS);
	useGeoJsonLayer("surviving-area", outline, OUTLINE_LAYERS);
	return null;
}
