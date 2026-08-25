import type { MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { multiPolygonFeature, multiPolygonOutlines } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";
import { outsideViewport, usePaddedView } from "./viewport-outside";

const MASK_FILL = [
	{
		id: "eliminated-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#0a0d14",
			"fill-opacity": 0.48,
			"fill-antialias": true,
		},
	},
];

/** Same casing as the area editor: light against the dim, dark against the map. */
const FOLD_LINE = [
	{
		id: "surviving-outline-case",
		type: "line" as const,
		layout: {
			"line-join": "round" as const,
			"line-cap": "round" as const,
		},
		paint: {
			"line-color": "#ffffff",
			"line-width": 7,
			"line-opacity": 1,
		},
	},
	{
		id: "surviving-outline",
		type: "line" as const,
		layout: {
			"line-join": "round" as const,
			"line-cap": "round" as const,
		},
		paint: {
			"line-color": "#08111c",
			"line-width": 3,
			"line-opacity": 1,
		},
	},
];

interface EliminatedLayerProps {
	/** The hole that stays bright: surviving search area, or the seed. */
	readonly hole: MultiPolygon | null;
}

/**
 * Viewport minus the surviving fold — the same mask the area editor uses, so
 * a pan never uncovers undimmed basemap past a static bbox.
 */
export function EliminatedLayer({ hole }: EliminatedLayerProps) {
	const view = usePaddedView();
	const mask = useMemo(
		() => multiPolygonFeature(outsideViewport(hole, view)),
		[hole, view],
	);
	const outline = useMemo(() => multiPolygonOutlines(hole), [hole]);
	useGeoJsonLayer("eliminated", mask, MASK_FILL);
	useGeoJsonLayer("surviving-area", outline, FOLD_LINE);
	return null;
}
