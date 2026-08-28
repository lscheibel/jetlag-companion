import type { LngLat, MultiPolygon } from "@zero-lag/geo";
import { useMemo } from "react";
import { CircleDraftLayer } from "./circle-draft-layer";
import { useYellowBlackLine } from "./draft-paint";
import { multiPolygonFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

const FILL_LAYERS = [
	{
		id: "constraint-draft-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#ffe01f",
			"fill-opacity": 0.1,
			"fill-outline-color": "rgba(0,0,0,0)",
		},
	},
];

interface ConstraintDraftLayerProps {
	readonly center?: LngLat | null;
	readonly centers?: readonly LngLat[];
	readonly radiusMeters?: number;
	readonly polygons?: MultiPolygon | null;
}

function BoundaryDraft({ polygons }: { readonly polygons: MultiPolygon }) {
	const outline = useYellowBlackLine("constraint-draft-outline");
	const data = useMemo(() => multiPolygonFeature(polygons), [polygons]);
	useGeoJsonLayer("constraint-draft-fill-source", data, FILL_LAYERS);
	useGeoJsonLayer("constraint-draft-outline-source", data, outline);
	return null;
}

/** In-progress constraint. Not the measure blue — this is a deduction. */
export function ConstraintDraftLayer({
	center = null,
	centers,
	radiusMeters = 0,
	polygons = null,
}: ConstraintDraftLayerProps) {
	if (polygons) return <BoundaryDraft polygons={polygons} />;
	return (
		<CircleDraftLayer
			center={center}
			centers={centers}
			kind="constraint"
			radiusMeters={radiusMeters}
		/>
	);
}
