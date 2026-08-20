import { circleLngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { EMPTY_FEATURES, multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

export interface MapSearchZone {
	readonly id: string;
	readonly lng: number;
	readonly lat: number;
	readonly radiusMeters: number;
	readonly note: string;
}

const ZONE_LAYERS = [
	{
		id: "search-zone-fill",
		type: "fill" as const,
		paint: { "fill-color": "#E69F00", "fill-opacity": 0.13 },
	},
	{
		id: "search-zone-outline",
		type: "line" as const,
		paint: { "line-color": "#E69F00", "line-width": 3 },
	},
];

export function SearchZoneLayer({
	zone,
}: {
	readonly zone: MapSearchZone | null;
}) {
	const data = useMemo(
		() =>
			zone
				? multiPolygonFeature(
						circleLngLat([zone.lng, zone.lat], zone.radiusMeters),
					)
				: EMPTY_FEATURES,
		[zone],
	);
	useGeoJsonLayer("search-zone-source", data, ZONE_LAYERS);
	return null;
}
