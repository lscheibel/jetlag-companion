import {
	type BBox,
	distanceMeters,
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	type Region,
	regionContains,
} from "@zero-lag/geo";
import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { useMemo } from "react";
import type { FeatureData } from "./geojson";
import { EMPTY_FEATURES } from "./geojson";
import type { SearchableStop } from "./toolkit";
import { useGeoJsonLayer } from "./use-geojson-layer";

function stopPaint(dark: boolean) {
	return {
		"circle-radius": 3.5,
		"circle-color": [
			"case",
			["get", "insideArea"],
			dark ? "#e7edf6" : "#08111c",
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

/** The stop the sheet is about: yellow-black, like every other in-hand mark. */
function selectedStopPaint() {
	return {
		"circle-radius": 7,
		"circle-color": "#ffe01f",
		"circle-stroke-color": "#08111c",
		"circle-stroke-width": 2.5,
		"circle-opacity": 1,
		"circle-stroke-opacity": 1,
	};
}

interface StopsLayerProps {
	readonly stops: readonly SearchableStop[];
	readonly id?: "builder-stops" | "play-stops";
	/**
	 * When set, stops outside this fold paint like stops outside the game area.
	 * Seekers only — hiders must not see a constraint cut as a dimmed station.
	 */
	readonly fold?: Region | null;
	/** Setup fence. Stops outside it fade with distance from its bbox. */
	readonly area?: MultiPolygon | null;
	/** The stop whose sheet is open, if any. */
	readonly selectedId?: string | null;
}

/**
 * Station dots, dimmed outside the area. m4-spec §9.
 *
 * Dimmed rather than hidden: a host judging a draw, and a seeker changing
 * trains just outside the line, both need to see what the polygon nearly
 * caught. Named lines are on the tap sheet, not beside the dots.
 */
export function BuilderStopsLayer({
	stops,
	id = "builder-stops",
	fold = null,
	area = null,
	selectedId = null,
}: StopsLayerProps) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	const layers = useMemo(
		() => [
			{ id, type: "circle" as const, paint: stopPaint(dark) },
			{
				id: `${id}-selected`,
				type: "circle" as const,
				filter: ["==", ["get", "selected"], true],
				paint: selectedStopPaint(),
			},
		],
		[id, dark],
	);
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		const bbox = area ? multiPolygonBBox(area) : null;
		const fadeRange = bbox ? fadeRangeMeters(bbox) : 8_000;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => {
				const inPlay = stopLooksInPlay(stop, fold);
				return {
					type: "Feature",
					properties: {
						insideArea: inPlay,
						opacity: stopOpacity(stop, inPlay, bbox, fadeRange),
						selected: stop.stopId === selectedId,
					},
					geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
				};
			}),
		};
	}, [stops, fold, area, selectedId]);
	useGeoJsonLayer(id, data, layers);
	return null;
}

function stopLooksInPlay(stop: SearchableStop, fold: Region | null): boolean {
	if (!stop.insideArea) return false;
	if (!fold) return true;
	return regionContains(fold, [stop.lng, stop.lat]);
}

/** How far past the setup bbox a stop can travel before it is nearly gone. */
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

function stopOpacity(
	stop: SearchableStop,
	inPlay: boolean,
	bbox: BBox | null,
	fadeRange: number,
): number {
	if (inPlay) return 1;
	if (stop.insideArea) return 0.28;
	if (!bbox) return 0.12;
	const t = Math.min(
		1,
		distanceOutsideBBox([stop.lng, stop.lat], bbox) / fadeRange,
	);
	return 0.38 * (1 - t) + 0.04 * t;
}
