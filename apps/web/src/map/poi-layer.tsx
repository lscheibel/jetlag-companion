import {
	type BBox,
	distanceMeters,
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
} from "@zero-lag/geo";
import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { useMemo } from "react";
import { EMPTY_FEATURES, type FeatureData } from "./geojson";
import { type MapPoi, POI_KIND_COLORS } from "./poi";
import { useGeoJsonLayer } from "./use-geojson-layer";

const KIND_COLOR_MATCH = Object.entries(POI_KIND_COLORS).flat();

function poiPaint(dark: boolean) {
	return {
		"circle-radius": 3.5,
		"circle-color": [
			"case",
			["get", "insideArea"],
			["match", ["get", "kind"], ...KIND_COLOR_MATCH, "#8b919c"],
			"#8b919c",
		] as unknown as string,
		"circle-stroke-color": dark ? "#000000" : "#ffffff",
		"circle-stroke-width": [
			"case",
			["get", "insideArea"],
			2.5,
			1.5,
		] as unknown as number,
		"circle-opacity": ["get", "opacity"] as unknown as number,
		"circle-stroke-opacity": ["get", "opacity"] as unknown as number,
	};
}

function selectedPoiPaint() {
	return {
		"circle-radius": 7,
		"circle-color": "#ffe01f",
		"circle-stroke-color": "#08111c",
		"circle-stroke-width": 2.5,
		"circle-opacity": 1,
		"circle-stroke-opacity": 1,
	};
}

interface PoiLayerProps {
	readonly pois: readonly MapPoi[];
	readonly area?: MultiPolygon | null;
	readonly selectedId?: string | null;
}

/**
 * Amenity dots, dimmed outside the area — the same treatment as stations, with
 * a colour per kind so they do not vanish into the stop field.
 */
export function PoiLayer({
	pois,
	area = null,
	selectedId = null,
}: PoiLayerProps) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	const layers = useMemo(
		() => [
			{ id: "play-pois", type: "circle" as const, paint: poiPaint(dark) },
			{
				id: "play-pois-selected",
				type: "circle" as const,
				filter: ["==", ["get", "selected"], true],
				paint: selectedPoiPaint(),
			},
		],
		[dark],
	);
	const data = useMemo<FeatureData>(() => {
		if (pois.length === 0) return EMPTY_FEATURES;
		const bbox = area ? multiPolygonBBox(area) : null;
		const fadeRange = bbox ? fadeRangeMeters(bbox) : 8_000;
		return {
			type: "FeatureCollection",
			features: pois.map((poi) => ({
				type: "Feature",
				properties: {
					kind: poi.kind,
					insideArea: poi.insideArea,
					opacity: poiOpacity(poi, bbox, fadeRange),
					selected: poi.id === selectedId,
				},
				geometry: { type: "Point", coordinates: [poi.lng, poi.lat] },
			})),
		};
	}, [pois, area, selectedId]);
	useGeoJsonLayer("play-pois", data, layers);
	return null;
}

function fadeRangeMeters(bbox: BBox): number {
	const diagonal = distanceMeters([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
	return Math.max(2_500, diagonal * 0.2);
}

function distanceOutsideBBox(point: LngLat, bbox: BBox): number {
	const clamped: LngLat = [
		Math.min(Math.max(point[0], bbox[0]), bbox[2]),
		Math.min(Math.max(point[1], bbox[1]), bbox[3]),
	];
	if (clamped[0] === point[0] && clamped[1] === point[1]) return 0;
	return distanceMeters(point, clamped);
}

function poiOpacity(poi: MapPoi, bbox: BBox | null, fadeRange: number): number {
	if (poi.insideArea) return 1;
	if (!bbox) return 0.12;
	const t = Math.min(
		1,
		distanceOutsideBBox([poi.lng, poi.lat], bbox) / fadeRange,
	);
	return 0.38 * (1 - t) + 0.04 * t;
}
