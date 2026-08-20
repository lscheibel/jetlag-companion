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
 * The valid hiding area, as an outline and nothing more. m2-spec §12.
 *
 * It is already synced, and a map with no game boundary on it is disorienting —
 * but nothing here means anything yet. Shading, elimination and everything else
 * that turns this outline into a deduction surface is M13's, and drawing a fill
 * now would be inventing a meaning that M13 has to undo.
 */
export function GameAreaLayer({ area }: GameAreaLayerProps) {
	const data = useMemo(() => multiPolygonFeature(area), [area]);
	useGeoJsonLayer("game-area", data, LAYERS);
	return null;
}
