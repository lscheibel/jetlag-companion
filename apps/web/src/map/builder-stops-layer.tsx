import { useMemo } from "react";
import type { FeatureData } from "./geojson";
import { EMPTY_FEATURES } from "./geojson";
import type { SearchableStop } from "./toolkit";
import { useGeoJsonLayer } from "./use-geojson-layer";

const PAINT = {
	"circle-radius": 3.5,
	"circle-color": [
		"case",
		["get", "insideArea"],
		"#08111c",
		"#8b919c",
	] as unknown as string,
	"circle-stroke-color": "#ffffff",
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

interface StopsLayerProps {
	readonly stops: readonly SearchableStop[];
	readonly id?: "builder-stops" | "play-stops";
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
}: StopsLayerProps) {
	const layers = useMemo(
		() => [{ id, type: "circle" as const, paint: PAINT }],
		[id],
	);
	const data = useMemo<FeatureData>(() => {
		if (stops.length === 0) return EMPTY_FEATURES;
		return {
			type: "FeatureCollection",
			features: stops.map((stop) => ({
				type: "Feature",
				properties: { insideArea: stop.insideArea },
				geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
			})),
		};
	}, [stops]);
	useGeoJsonLayer(id, data, layers);
	return null;
}
