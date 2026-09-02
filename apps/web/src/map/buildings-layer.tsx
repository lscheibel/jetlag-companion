import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { useEffect } from "react";
import { useMapInstance } from "./map-canvas";
import { useMapCamera } from "./use-map-camera";

const LAYER_ID = "buildings-3d";

/**
 * Extruded blocks read as the basemap's buildings standing up, so they take the
 * basemap's own colour — a beige from the light style, lit over the dark one,
 * is a city of lamps on a map whose whole point is being unlit.
 */
const FACE_COLOR = { light: "#d8d4cf", dark: "#18222f" } as const;

export function BuildingsLayer() {
	const map = useMapInstance();
	const { resolved } = useTheme();
	const { pitch, zoom } = useMapCamera();
	const visible = zoom >= 15 && pitch >= 20;

	useEffect(() => {
		if (!map || !visible || map.getLayer(LAYER_ID)) return;
		const source = map
			.getStyle()
			.layers.find(
				(layer) =>
					"source-layer" in layer && layer["source-layer"] === "building",
			);
		if (!source || !("source" in source) || typeof source.source !== "string") {
			return;
		}
		map.addLayer({
			id: LAYER_ID,
			type: "fill-extrusion",
			source: source.source,
			"source-layer": "building",
			minzoom: 15,
			paint: {
				"fill-extrusion-color": FACE_COLOR[resolved],
				"fill-extrusion-height": [
					"coalesce",
					["get", "render_height"],
					["get", "height"],
					3,
				],
				"fill-extrusion-base": [
					"coalesce",
					["get", "render_min_height"],
					["get", "min_height"],
					0,
				],
				"fill-extrusion-opacity": 0.72,
			},
		});
		return () => {
			if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
		};
	}, [map, visible, resolved]);

	return null;
}
