import type { LngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { lineFeature, pointsFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const LINE_LAYERS = [
	{
		id: "draw-line",
		type: "line" as const,
		paint: {
			"line-color": "#1d4ed8",
			"line-width": 2,
			"line-dasharray": [2, 2],
		},
	},
];

const VERTEX_LAYERS = [
	{
		id: "draw-vertices",
		type: "circle" as const,
		paint: {
			"circle-radius": 6,
			"circle-color": "#ffffff",
			"circle-stroke-color": "#1d4ed8",
			"circle-stroke-width": 2,
		},
	},
];

interface DrawLayerProps {
	readonly ring: readonly LngLat[];
}

/**
 * The ring in progress. m4-spec §9.
 *
 * `MeasureLayer` in a different colour, near enough: a ring of tapped vertices
 * with a line between them is exactly what M3's path measurement renders. The
 * closing segment back to the first vertex is drawn once there are three, so
 * the host sees the shape they are about to get rather than an open path.
 */
export function DrawLayer({ ring }: DrawLayerProps) {
	const line = useMemo(
		() => lineFeature(ring.length >= 3 ? [...ring, ring[0] as LngLat] : ring),
		[ring],
	);
	const vertices = useMemo(() => pointsFeature(ring), [ring]);
	useGeoJsonLayer("builder-draw-line", line, LINE_LAYERS);
	useGeoJsonLayer("builder-draw-vertices", vertices, VERTEX_LAYERS);
	return null;
}
