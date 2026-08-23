import type { MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const LAYERS = [
	{
		id: "game-area-outline",
		type: "line" as const,
		paint: {
			"line-color": "#111827",
			"line-width": 2,
			"line-dasharray": [2, 2],
			"line-opacity": 0.6,
		},
	},
];

interface GameAreaLayerProps {
	readonly area: MultiPolygon | null;
}

/**
 * The valid hiding area, as a dashed outline. The fill that means "out of play"
 * lives on `EliminatedLayer` — this outline is the original fence, even after
 * constraints have cut the surviving blob smaller.
 */
export function GameAreaLayer({ area }: GameAreaLayerProps) {
	const data = useMemo(() => multiPolygonFeature(area), [area]);
	useGeoJsonLayer("game-area", data, LAYERS);
	return null;
}
