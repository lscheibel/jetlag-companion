import {
	type BBox,
	type MultiPolygon,
	multiPolygonToRegion,
	regionToMultiPolygon,
	subtractRegions,
} from "@zero-lag/geo";
import { useEffect, useMemo, useState } from "react";
import type { CatalogStopRow } from "../../builder/api";
import {
	EMPTY_FEATURES,
	type FeatureData,
	multiPolygonFeature,
	multiPolygonOutlines,
} from "../../map/geojson";
import { useMapInstance } from "../../map/map-canvas";
import { useGeoJsonLayer } from "../../map/use-geojson-layer";

/**
 * Viewport minus the fold. The playable hole stays the map; everything else
 * on screen is the dim. A globe-sized complement is a MapLibre antimeridian
 * trap, so the outer ring is the current view, not WORLD.
 */
function outsideViewport(
	area: MultiPolygon | null,
	view: BBox | null,
): MultiPolygon | null {
	if (!area || area.length === 0 || !view) return null;
	const [west, south, east, north] = view;
	const frame = {
		polygons: [
			[
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south],
				],
			],
		],
	};
	const outside = subtractRegions(frame, multiPolygonToRegion(area));
	return outside.polygons.length === 0 ? null : regionToMultiPolygon(outside);
}

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
	const map = useMapInstance();
	const [view, setView] = useState<BBox | null>(null);

	useEffect(() => {
		if (!map) return;
		let frame = 0;
		const emit = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				const bounds = map.getBounds();
				const west = bounds.getWest();
				const south = bounds.getSouth();
				const east = bounds.getEast();
				const north = bounds.getNorth();
				const padLng = (east - west) * 0.08;
				const padLat = (north - south) * 0.08;
				setView([west - padLng, south - padLat, east + padLng, north + padLat]);
			});
		};
		emit();
		map.on("move", emit);
		map.on("resize", emit);
		return () => {
			cancelAnimationFrame(frame);
			map.off("move", emit);
			map.off("resize", emit);
		};
	}, [map]);

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
			"circle-color": "#3e88e8",
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 1,
		},
	},
];

interface FoldStopsLayerProps {
	readonly stops: readonly CatalogStopRow[];
}

export function FoldStopsLayer({ stops }: FoldStopsLayerProps) {
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => ({
				type: "Feature",
				properties: {},
				geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
			})),
		};
	}, [stops]);
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
