import type { LngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { ringMidpoints } from "./draw-handles";
import { lineFeature, pointsFeature } from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

export type RingDraftKind = "measure" | "draw";

const MEASURE_LINE = [
	{
		id: "measure-line",
		type: "line" as const,
		paint: { "line-color": "#0072B2", "line-width": 3 },
	},
];
const MEASURE_MIDPOINTS = [
	{
		id: "measure-midpoints",
		type: "circle" as const,
		paint: {
			"circle-color": "#0072B2",
			"circle-radius": 5,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 2,
		},
	},
];
const MEASURE_VERTICES = [
	{
		id: "measure-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffffff",
			"circle-radius": 8,
			"circle-stroke-color": "#0072B2",
			"circle-stroke-width": 2,
		},
	},
];
const DRAW_LINE = [
	{
		id: "draw-line",
		type: "line" as const,
		paint: {
			"line-color": "#1d4ed8",
			"line-width": 2,
			"line-dasharray": [2, 2],
		},
	},
];
const DRAW_MIDPOINTS = [
	{
		id: "draw-midpoints",
		type: "circle" as const,
		paint: {
			"circle-color": "#1d4ed8",
			"circle-radius": 5,
			"circle-stroke-color": "#ffffff",
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
			"circle-color": "#ffffff",
			"circle-stroke-color": "#1d4ed8",
			"circle-stroke-width": 2,
		},
	},
];

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
	useGeoJsonLayer("measure-line-source", line, MEASURE_LINE);
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
	useGeoJsonLayer("builder-draw-line", line, DRAW_LINE);
	useGeoJsonLayer("builder-draw-midpoints", midpoints, DRAW_MIDPOINTS);
	useGeoJsonLayer("builder-draw-vertices", vertices, DRAW_VERTICES);
	return null;
}

/**
 * An open path or a closing ring of vertices. Measure blue vs builder/constraint
 * dashed blue — same geometry, different paint.
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
