import type { MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import type { CatalogStopRow } from "../../builder/api";
import {
	EMPTY_FEATURES,
	type FeatureData,
	multiPolygonFeature,
	multiPolygonOutlines,
} from "../../map/geojson";
import { useGeoJsonLayer } from "../../map/use-geojson-layer";
import { outsideViewport, usePaddedView } from "../../map/viewport-outside";

const MASK_FILL = [
	{
		id: "setup-fold-mask",
		type: "fill" as const,
		paint: {
			"fill-color": "#0a0d14",
			"fill-opacity": 0.48,
			"fill-antialias": true,
		},
	},
];

/** Light casing against the dim, dark core against the map. */
const FOLD_LINE = [
	{
		id: "setup-fold-outline-case",
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
		id: "setup-fold-outline",
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

interface FoldLayerProps {
	readonly area: MultiPolygon | null;
}

export function FoldLayer({ area }: FoldLayerProps) {
	const view = usePaddedView();
	const mask = useMemo(
		() => multiPolygonFeature(outsideViewport(area, view)),
		[area, view],
	);
	const outline = useMemo(() => multiPolygonOutlines(area), [area]);
	useGeoJsonLayer("setup-fold-mask", mask, MASK_FILL);
	useGeoJsonLayer("setup-fold-outline", outline, FOLD_LINE);
	return null;
}

const STOP_DOTS = [
	{
		id: "setup-fold-stops",
		type: "circle" as const,
		paint: {
			"circle-radius": 3.5,
			"circle-color": [
				"case",
				["==", ["get", "inPlay"], 1],
				"#08111c",
				"#8b919c",
			] as unknown as string,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": [
				"case",
				["==", ["get", "inPlay"], 1],
				2.5,
				1.5,
			] as unknown as number,
			"circle-opacity": [
				"case",
				["==", ["get", "inPlay"], 1],
				1,
				0.33,
			] as unknown as number,
			"circle-stroke-opacity": [
				"case",
				["==", ["get", "inPlay"], 1],
				1,
				0.33,
			] as unknown as number,
		},
	},
];

interface FoldStopsLayerProps {
	readonly stops: readonly CatalogStopRow[];
	/** Null while every mode in the area counts. */
	readonly inPlayModeIds?: readonly string[] | null;
}

export function FoldStopsLayer({
	stops,
	inPlayModeIds = null,
}: FoldStopsLayerProps) {
	const modeKey = inPlayModeIds?.slice().sort().join(",") ?? "";
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		const wanted = modeKey ? new Set(modeKey.split(",")) : null;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => ({
				type: "Feature",
				properties: {
					inPlay:
						!wanted || stop.modeIds.some((modeId) => wanted.has(modeId))
							? 1
							: 0,
				},
				geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
			})),
		};
	}, [stops, modeKey]);
	useGeoJsonLayer("setup-fold-stops", data, STOP_DOTS);
	return null;
}

const ADD_FILL = [
	{
		id: "piece-preview-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#ffe01f",
			"fill-opacity": 0.22,
			"fill-outline-color": "rgba(0,0,0,0)",
		},
	},
];

const ADD_LINE = [
	{
		id: "piece-preview-outline",
		type: "line" as const,
		layout: {
			"line-join": "round" as const,
			"line-cap": "round" as const,
		},
		paint: {
			"line-color": "#ffe01f",
			"line-width": 2.5,
			"line-dasharray": [2, 1.5],
		},
	},
];

const CUT_FILL = [
	{
		id: "piece-cut-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#ff5a3c",
			"fill-opacity": 0.18,
			"fill-outline-color": "rgba(0,0,0,0)",
		},
	},
];

const CUT_LINE = [
	{
		id: "piece-cut-outline",
		type: "line" as const,
		layout: {
			"line-join": "round" as const,
			"line-cap": "round" as const,
		},
		paint: {
			"line-color": "#ff5a3c",
			"line-width": 2.5,
			"line-dasharray": [2, 1.5],
		},
	},
];

interface PreviewLayerProps {
	readonly geometry: MultiPolygon | null;
	readonly op: "add" | "subtract";
}

export function PreviewLayer({ geometry, op }: PreviewLayerProps) {
	const fill = useMemo(() => multiPolygonFeature(geometry), [geometry]);
	const outline = useMemo(() => multiPolygonOutlines(geometry), [geometry]);
	const cut = op === "subtract";
	useGeoJsonLayer(
		cut ? "setup-cut-preview" : "setup-add-preview",
		fill,
		cut ? CUT_FILL : ADD_FILL,
	);
	useGeoJsonLayer(
		cut ? "setup-cut-preview-outline" : "setup-add-preview-outline",
		outline,
		cut ? CUT_LINE : ADD_LINE,
	);
	return null;
}
