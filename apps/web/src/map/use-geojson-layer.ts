import type {
	GeoJSONSource,
	GeoJSONSourceSpecification,
	LayerSpecification,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { FeatureData } from "./geojson";
import { useMapInstance } from "./map-canvas";

const LAYER_ORDER = [
	"game-area-outline",
	"buildings-3d",
	"search-zone-fill",
	"search-zone-outline",
	"pin-radius-fill",
	"pin-radius-outline",
	"measure-fill",
	"measure-line",
	"measure-vertices",
	"own-accuracy-fill",
	"own-accuracy-outline",
] as const;

function beforeLayer(
	map: NonNullable<ReturnType<typeof useMapInstance>>,
	layerId: string,
): string | undefined {
	const position = LAYER_ORDER.indexOf(layerId as (typeof LAYER_ORDER)[number]);
	if (position < 0) return undefined;
	for (const candidate of LAYER_ORDER.slice(position + 1)) {
		if (map.getLayer(candidate)) return candidate;
	}
	return undefined;
}

export function useGeoJsonLayer(
	sourceId: string,
	data: FeatureData,
	layers: readonly Omit<LayerSpecification, "source">[],
): void {
	const map = useMapInstance();
	const openingData = useRef(data);

	useEffect(() => {
		if (!map) return;
		map.addSource(sourceId, {
			type: "geojson",
			data: openingData.current,
		} satisfies GeoJSONSourceSpecification);
		for (const layer of layers) {
			map.addLayer(
				{ ...layer, source: sourceId } as LayerSpecification,
				beforeLayer(map, layer.id),
			);
		}
		return () => {
			for (const layer of [...layers].reverse()) {
				if (map.getLayer(layer.id)) map.removeLayer(layer.id);
			}
			if (map.getSource(sourceId)) map.removeSource(sourceId);
		};
	}, [map, sourceId, layers]);

	useEffect(() => {
		map?.getSource<GeoJSONSource>(sourceId)?.setData(data);
	}, [map, sourceId, data]);
}
