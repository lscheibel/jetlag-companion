import type { MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const LAYERS = [
	{
		id: "area-fill",
		type: "fill" as const,
		paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
	},
	{
		id: "area-outline",
		type: "line" as const,
		paint: { "line-color": "#1d4ed8", "line-width": 2 },
	},
];

interface AreaLayerProps {
	readonly area: MultiPolygon | null;
}

/**
 * The area a builder session has produced, filled. m4-spec §9.
 *
 * `GameAreaLayer` draws the same geometry as a dashed outline on the play
 * screen and deliberately does not fill it — a fill there would invent a
 * meaning M13 has to undo. Here the fill *is* the meaning: it is the thing the
 * host is making, and they need to see its shape rather than infer it.
 */
export function AreaLayer({ area }: AreaLayerProps) {
	const data = useMemo(() => multiPolygonFeature(area), [area]);
	useGeoJsonLayer("builder-area", data, LAYERS);
	return null;
}
