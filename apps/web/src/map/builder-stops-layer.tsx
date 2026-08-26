import { type Region, regionContains } from "@zero-lag/geo";
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
		"circle-opacity": [
			"case",
			["get", "insideArea"],
			1,
			0.33,
		] as unknown as number,
		"circle-stroke-opacity": [
			"case",
			["get", "insideArea"],
			1,
			0.33,
		] as unknown as number,
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
}: StopsLayerProps) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	const layers = useMemo(
		() => [{ id, type: "circle" as const, paint: stopPaint(dark) }],
		[id, dark],
	);
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => ({
				type: "Feature",
				properties: {
					insideArea: stopLooksInPlay(stop, fold),
				},
				geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
			})),
		};
	}, [stops, fold]);
	useGeoJsonLayer(id, data, layers);
	return null;
}

function stopLooksInPlay(stop: SearchableStop, fold: Region | null): boolean {
	if (!stop.insideArea) return false;
	if (!fold) return true;
	return regionContains(fold, [stop.lng, stop.lat]);
}
