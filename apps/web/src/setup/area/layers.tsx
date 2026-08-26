import { type MultiPolygon, type Region, regionContains } from "@zero-lag/geo";
import { useMemo } from "react";
import type { CatalogStopRow } from "../../builder/api";
import { BuilderStopsLayer } from "../../map/builder-stops-layer";
import { multiPolygonFeature, multiPolygonOutlines } from "../../map/geojson";
import type { SearchableStop } from "../../map/toolkit";
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

interface FoldStopsLayerProps {
	readonly stops: readonly CatalogStopRow[];
	readonly fold: Region;
	/** Setup fence. Stops outside it fade with distance, as on the play map. */
	readonly area: MultiPolygon | null;
	/** Null while every mode in the area counts. */
	readonly inPlayModeIds?: readonly string[] | null;
}

/**
 * Station dots with the play map's paint: theme-aware cores, a hard edge
 * inside the fold, and a fade past it. Modes that do not count are left off,
 * the same way the play catalog withholds them.
 */
export function FoldStopsLayer({
	stops,
	fold,
	area,
	inPlayModeIds = null,
}: FoldStopsLayerProps) {
	const modeKey = inPlayModeIds?.slice().sort().join(",") ?? "";
	const searchable = useMemo<readonly SearchableStop[]>(() => {
		const wanted = modeKey ? new Set(modeKey.split(",")) : null;
		return stops
			.filter(
				(stop) => !wanted || stop.modeIds.some((modeId) => wanted.has(modeId)),
			)
			.map((stop) => ({
				stopId: stop.id,
				name: stop.name,
				lng: stop.lng,
				lat: stop.lat,
				modeIds: stop.modeIds,
				lines: stop.lines ?? [],
				insideArea: regionContains(fold, [stop.lng, stop.lat]),
			}));
	}, [stops, fold, modeKey]);
	return <BuilderStopsLayer area={area} stops={searchable} />;
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
