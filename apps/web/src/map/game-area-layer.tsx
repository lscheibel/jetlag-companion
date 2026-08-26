import type { MultiPolygon } from "@zero-lag/geo";
import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { useMemo } from "react";
import { multiPolygonOutlines } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

interface GameAreaLayerProps {
	readonly area: MultiPolygon | null;
}

/**
 * The setup fence, as a striped muted outline. The surviving fold has its
 * own solid casing; this is the original valid area, still visible after
 * constraints have cut the remaining blob smaller.
 */
export function GameAreaLayer({ area }: GameAreaLayerProps) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	const layers = useMemo(
		() => [
			{
				id: "game-area-outline",
				type: "line" as const,
				layout: {
					"line-join": "round" as const,
					"line-cap": "butt" as const,
				},
				paint: {
					"line-color": dark ? "#9aa3b0" : "#5c6570",
					"line-width": 2.25,
					"line-dasharray": [2.2, 1.8],
					"line-opacity": dark ? 0.55 : 0.5,
				},
			},
		],
		[dark],
	);
	const data = useMemo(() => multiPolygonOutlines(area), [area]);
	useGeoJsonLayer("game-area", data, layers);
	return null;
}
