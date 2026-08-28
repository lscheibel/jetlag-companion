import type { LngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { useYellowBlackLine } from "./draft-paint";
import { ringMidpoints } from "./draw-handles";
import {
	EMPTY_FEATURES,
	type FeatureData,
	lineFeature,
	pointsFeature,
} from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

export type RingDraftKind = "measure" | "draw";

const MEASURE_MIDPOINTS = [
	{
		id: "measure-midpoints",
		type: "circle" as const,
		paint: {
			"circle-color": "#08111c",
			"circle-radius": 5,
			"circle-stroke-color": "#ffe01f",
			"circle-stroke-width": 2,
		},
	},
];
const MEASURE_VERTICES = [
	{
		id: "measure-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffe01f",
			"circle-radius": 8,
			"circle-stroke-color": "#08111c",
			"circle-stroke-width": 2,
		},
	},
];
const DRAW_FILL = [
	{
		id: "draw-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#ffe01f",
			"fill-opacity": 0.1,
			"fill-outline-color": "rgba(0,0,0,0)",
		},
	},
];
const DRAW_MIDPOINTS = [
	{
		id: "draw-midpoints",
		type: "circle" as const,
		paint: {
			"circle-color": "#08111c",
			"circle-radius": 5,
			"circle-stroke-color": "#ffe01f",
			"circle-stroke-width": 2,
		},
	},
];
const DRAW_VERTICES = [
	{
		id: "draw-vertices",
		type: "circle" as const,
		paint: {
			"circle-radius": 8,
			"circle-color": "#ffe01f",
			"circle-stroke-color": "#08111c",
			"circle-stroke-width": 2,
		},
	},
];

function ringFillFeature(points: readonly LngLat[]): FeatureData {
	if (points.length < 3) return EMPTY_FEATURES;
	const coords = points.map(([lng, lat]) => [lng, lat]);
	const first = coords[0];
	if (first) coords.push(first);
	return {
		type: "Feature",
		properties: {},
		geometry: { type: "Polygon", coordinates: [coords] },
	};
}

function MeasureRingDraft({
	points,
	closed,
}: {
	readonly points: readonly LngLat[];
	readonly closed: boolean;
}) {
	const line = useMemo(
		() =>
			lineFeature(
				closed && points.length >= 3
					? [...points, points[0] as LngLat]
					: points,
			),
		[closed, points],
	);
	const vertices = useMemo(() => pointsFeature(points), [points]);
	const midpoints = useMemo(
		() => pointsFeature(ringMidpoints(points, closed)),
		[closed, points],
	);
	const lineLayers = useYellowBlackLine("measure-line");
	useGeoJsonLayer("measure-line-source", line, lineLayers);
	useGeoJsonLayer("measure-midpoints-source", midpoints, MEASURE_MIDPOINTS);
	useGeoJsonLayer("measure-vertices-source", vertices, MEASURE_VERTICES);
	return null;
}

function DrawRingDraft({
	points,
	closed,
}: {
	readonly points: readonly LngLat[];
	readonly closed: boolean;
}) {
	const fill = useMemo(
		() => (closed ? ringFillFeature(points) : EMPTY_FEATURES),
		[closed, points],
	);
	const line = useMemo(() => lineFeature(points), [points]);
	const close = useMemo(() => {
		const first = points[0];
		const last = points[points.length - 1];
		if (!closed || !first || !last || points.length < 2) return EMPTY_FEATURES;
		return lineFeature([last, first]);
	}, [closed, points]);
	const vertices = useMemo(() => pointsFeature(points), [points]);
	const midpoints = useMemo(
		() => pointsFeature(ringMidpoints(points, closed)),
		[closed, points],
	);
	const lineLayers = useYellowBlackLine("draw-line");
	const closeLayers = useYellowBlackLine("draw-close", true);
	useGeoJsonLayer("builder-draw-fill", fill, DRAW_FILL);
	useGeoJsonLayer("builder-draw-line", line, lineLayers);
	useGeoJsonLayer("builder-draw-close", close, closeLayers);
	useGeoJsonLayer("builder-draw-midpoints", midpoints, DRAW_MIDPOINTS);
	useGeoJsonLayer("builder-draw-vertices", vertices, DRAW_VERTICES);
	return null;
}

/**
 * An open path or a closing ring of vertices. Draw uses a solid path, a
 * dashed close, and a light fill; measure is the same vertices on a yellow
 * line.
 */
export function RingDraftLayer({
	kind,
	points,
	closed,
}: {
	readonly kind: RingDraftKind;
	readonly points: readonly LngLat[];
	readonly closed: boolean;
}) {
	if (kind === "measure") {
		return <MeasureRingDraft closed={closed} points={points} />;
	}
	return <DrawRingDraft closed={closed} points={points} />;
}
