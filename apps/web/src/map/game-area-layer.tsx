import type { MultiPolygon } from "@zero-lag/geo";
import { useEffect } from "react";
import { multiPolygonFeature } from "./geojson";
import { useMapInstance } from "./map-canvas";

const SOURCE_ID = "game-area";
const LAYER_ID = "game-area-outline";

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
	const map = useMapInstance();

	// A source and a layer are objects owned by MapLibre, so they are set up and
	// torn down the way any other external system is.
	useEffect(() => {
		if (!map || !area) return;

		map.addSource(SOURCE_ID, {
			type: "geojson",
			data: multiPolygonFeature(area),
		});
		map.addLayer({
			id: LAYER_ID,
			type: "line",
			source: SOURCE_ID,
			paint: {
				"line-color": "#111827",
				"line-width": 2,
				"line-dasharray": [2, 2],
				"line-opacity": 0.6,
			},
		});

		return () => {
			if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
			if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
		};
	}, [map, area]);

	return null;
}
