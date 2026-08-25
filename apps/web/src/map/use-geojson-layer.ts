import type {
	GeoJSONSource,
	GeoJSONSourceSpecification,
	LayerSpecification,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { FeatureData } from "./geojson";
import { useMapInstance } from "./map-canvas";

/**
 * One declared order for two screens. The builder never mounts the play layers
 * and the map route never mounts the builder's, but they share this list
 * because m3-spec §9's argument against discovering layer order from React's
 * mount order does not weaken when there are two screens. m4-spec §9.
 */
const LAYER_ORDER = [
	"setup-fold-mask",
	"setup-fold-outline-case",
	"setup-fold-outline",
	"setup-fold-stops",
	"area-fill",
	"game-area-outline",
	"piece-preview-fill",
	"piece-preview-outline",
	"piece-cut-fill",
	"piece-cut-outline",
	"area-draft-fill",
	"area-draft-outline",
	"area-draft-line",
	"area-draft-vertices",
	"buildings-3d",
	"eliminated-fill",
	"surviving-outline-case",
	"surviving-outline",
	"builder-stops",
	"play-stops",
	"search-zone-fill",
	"search-zone-outline",
	"zone-draft-fill",
	"zone-draft-outline",
	"zone-draft-line",
	"zone-draft-vertices",
	"pin-radius-fill",
	"pin-radius-outline",
	"measure-fill",
	"measure-line-case",
	"measure-line",
	"measure-midpoints",
	"measure-vertices",
	"constraint-draft-fill",
	"constraint-draft-outline-case",
	"constraint-draft-outline",
	"constraint-draft-line-case",
	"constraint-draft-line",
	"constraint-draft-vertices",
	"own-accuracy-fill",
	"own-accuracy-outline",
	"draw-fill",
	"draw-line-case",
	"draw-line",
	"draw-close-case",
	"draw-close",
	"draw-midpoints",
	"draw-vertices",
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
	openingData.current = data;

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
