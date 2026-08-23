import type { LngLat, MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { CircleDraftLayer } from "./circle-draft-layer";
import { multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const FILL_LAYERS = [
	{
		id: "constraint-draft-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#111827",
			"fill-opacity": 0.12,
		},
	},
];

const OUTLINE_LAYERS = [
	{
		id: "constraint-draft-outline",
		type: "line" as const,
		paint: {
			"line-color": "#111827",
			"line-width": 2,
		},
	},
];

interface ConstraintDraftLayerProps {
	readonly center?: LngLat | null;
	readonly radiusMeters?: number;
	readonly polygons?: MultiPolygon | null;
}

function BoundaryDraft({ polygons }: { readonly polygons: MultiPolygon }) {
	const data = useMemo(() => multiPolygonFeature(polygons), [polygons]);
	useGeoJsonLayer("constraint-draft-fill-source", data, FILL_LAYERS);
	useGeoJsonLayer("constraint-draft-outline-source", data, OUTLINE_LAYERS);
	return null;
}

/** In-progress constraint. Not the measure blue — this is a deduction. */
export function ConstraintDraftLayer({
	center = null,
	radiusMeters = 0,
	polygons = null,
}: ConstraintDraftLayerProps) {
	if (polygons) return <BoundaryDraft polygons={polygons} />;
	return (
		<CircleDraftLayer
			center={center}
			kind="constraint"
			radiusMeters={radiusMeters}
		/>
	);
}
