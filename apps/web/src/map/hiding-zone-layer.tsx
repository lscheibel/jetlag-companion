import { circleLngLat, type LngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { yellowBlackLine } from "./draft-paint";
import { EMPTY_FEATURES, multiPolygonFeature } from "./geojson";
import { MapMarker } from "./map-canvas";
import { useGeoJsonLayer } from "./use-geojson-layer";

const ZONE_FILL = {
	id: "hiding-zone-fill",
	type: "fill" as const,
	paint: {
		"fill-color": "#ffe01f",
		"fill-opacity": 0.16,
		"fill-outline-color": "rgba(0,0,0,0)",
	},
};

interface HidingZoneLayerProps {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
	/** Solid once committed; dashed while still a pick. */
	readonly committed?: boolean;
}

/** The circle a hider has to stay in. Private to that team. */
export function HidingZoneLayer({
	center,
	radiusMeters,
	committed = false,
}: HidingZoneLayerProps) {
	const data = useMemo(
		() =>
			center && radiusMeters > 0
				? multiPolygonFeature(circleLngLat(center, radiusMeters))
				: EMPTY_FEATURES,
		[center, radiusMeters],
	);
	const layers = useMemo(
		() => [ZONE_FILL, ...yellowBlackLine("hiding-zone-outline", !committed)],
		[committed],
	);
	useGeoJsonLayer("hiding-zone-source", data, layers);

	if (!center) return null;
	return (
		<MapMarker lat={center[1]} lng={center[0]}>
			<span
				className="block size-3 rounded-full border-2 border-white bg-action shadow"
				data-testid="hiding-zone-center"
			/>
		</MapMarker>
	);
}
