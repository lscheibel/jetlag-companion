import { circleLngLat, type LngLat, offsetLngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import {
	EMPTY_FEATURES,
	lineFeature,
	multiPolygonFeature,
	pointsFeature,
} from "./geojson";
import { useGeoJsonLayer } from "./use-geojson-layer";

export type CircleDraftKind = "measure" | "constraint" | "zone" | "area";

const MEASURE_FILL = [
	{
		id: "measure-fill",
		type: "fill" as const,
		paint: { "fill-color": "#0072B2", "fill-opacity": 0.14 },
	},
];
const MEASURE_SPOKE = [
	{
		id: "measure-line",
		type: "line" as const,
		paint: { "line-color": "#0072B2", "line-width": 3 },
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
const CONSTRAINT_FILL = [
	{
		id: "constraint-draft-fill",
		type: "fill" as const,
		paint: { "fill-color": "#111827", "fill-opacity": 0.12 },
	},
];
const CONSTRAINT_OUTLINE = [
	{
		id: "constraint-draft-outline",
		type: "line" as const,
		paint: { "line-color": "#111827", "line-width": 2 },
	},
];
const CONSTRAINT_SPOKE = [
	{
		id: "constraint-draft-line",
		type: "line" as const,
		paint: { "line-color": "#111827", "line-width": 2 },
	},
];
const CONSTRAINT_VERTICES = [
	{
		id: "constraint-draft-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffffff",
			"circle-radius": 8,
			"circle-stroke-color": "#111827",
			"circle-stroke-width": 2,
		},
	},
];
const ZONE_FILL = [
	{
		id: "zone-draft-fill",
		type: "fill" as const,
		paint: { "fill-color": "#E69F00", "fill-opacity": 0.13 },
	},
];
const ZONE_OUTLINE = [
	{
		id: "zone-draft-outline",
		type: "line" as const,
		paint: { "line-color": "#E69F00", "line-width": 3 },
	},
];
const ZONE_SPOKE = [
	{
		id: "zone-draft-line",
		type: "line" as const,
		paint: { "line-color": "#E69F00", "line-width": 3 },
	},
];
const ZONE_VERTICES = [
	{
		id: "zone-draft-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffffff",
			"circle-radius": 8,
			"circle-stroke-color": "#E69F00",
			"circle-stroke-width": 2,
		},
	},
];

function useCircleGeometry(center: LngLat | null, radiusMeters: number) {
	const edge = center ? offsetLngLat(center, radiusMeters, 0) : null;
	const fill = useMemo(
		() =>
			center
				? multiPolygonFeature(circleLngLat(center, radiusMeters))
				: EMPTY_FEATURES,
		[center, radiusMeters],
	);
	const spoke = useMemo(
		() => (center && edge ? lineFeature([center, edge]) : EMPTY_FEATURES),
		[center, edge],
	);
	const vertices = useMemo(
		() => (center && edge ? pointsFeature([center, edge]) : EMPTY_FEATURES),
		[center, edge],
	);
	return { fill, spoke, vertices };
}

function MeasureCircleDraft({
	center,
	radiusMeters,
}: {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
}) {
	const { fill, spoke, vertices } = useCircleGeometry(center, radiusMeters);
	useGeoJsonLayer("measure-fill-source", fill, MEASURE_FILL);
	useGeoJsonLayer("measure-line-source", spoke, MEASURE_SPOKE);
	useGeoJsonLayer("measure-vertices-source", vertices, MEASURE_VERTICES);
	return null;
}

function ConstraintCircleDraft({
	center,
	radiusMeters,
}: {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
}) {
	const { fill, spoke, vertices } = useCircleGeometry(center, radiusMeters);
	useGeoJsonLayer("constraint-draft-fill-source", fill, CONSTRAINT_FILL);
	useGeoJsonLayer("constraint-draft-outline-source", fill, CONSTRAINT_OUTLINE);
	useGeoJsonLayer("constraint-draft-line-source", spoke, CONSTRAINT_SPOKE);
	useGeoJsonLayer(
		"constraint-draft-vertices-source",
		vertices,
		CONSTRAINT_VERTICES,
	);
	return null;
}

function ZoneCircleDraft({
	center,
	radiusMeters,
}: {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
}) {
	const { fill, spoke, vertices } = useCircleGeometry(center, radiusMeters);
	useGeoJsonLayer("zone-draft-fill-source", fill, ZONE_FILL);
	useGeoJsonLayer("zone-draft-outline-source", fill, ZONE_OUTLINE);
	useGeoJsonLayer("zone-draft-line-source", spoke, ZONE_SPOKE);
	useGeoJsonLayer("zone-draft-vertices-source", vertices, ZONE_VERTICES);
	return null;
}

const AREA_FILL = [
	{
		id: "area-draft-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#ffe01f",
			"fill-opacity": 0.22,
			"fill-outline-color": "rgba(0,0,0,0)",
		},
	},
];
const AREA_OUTLINE = [
	{
		id: "area-draft-outline",
		type: "line" as const,
		paint: {
			"line-color": "#ffe01f",
			"line-width": 3,
			"line-dasharray": [2, 1.5],
		},
	},
];
const AREA_SPOKE = [
	{
		id: "area-draft-line",
		type: "line" as const,
		paint: { "line-color": "#ffe01f", "line-width": 3 },
	},
];
const AREA_VERTICES = [
	{
		id: "area-draft-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffffff",
			"circle-radius": 8,
			"circle-stroke-color": "#ffe01f",
			"circle-stroke-width": 2,
		},
	},
];

function AreaCircleDraft({
	center,
	radiusMeters,
}: {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
}) {
	const { fill, spoke, vertices } = useCircleGeometry(center, radiusMeters);
	useGeoJsonLayer("area-draft-fill-source", fill, AREA_FILL);
	useGeoJsonLayer("area-draft-outline-source", fill, AREA_OUTLINE);
	useGeoJsonLayer("area-draft-line-source", spoke, AREA_SPOKE);
	useGeoJsonLayer("area-draft-vertices-source", vertices, AREA_VERTICES);
	return null;
}

/**
 * A live radius draft: fill, optional circumference, spoke to the east handle,
 * and centre + edge vertices. Paint stays per product colour.
 */
export function CircleDraftLayer({
	kind,
	center,
	radiusMeters,
}: {
	readonly kind: CircleDraftKind;
	readonly center: LngLat | null;
	readonly radiusMeters: number;
}) {
	if (kind === "measure") {
		return <MeasureCircleDraft center={center} radiusMeters={radiusMeters} />;
	}
	if (kind === "constraint") {
		return (
			<ConstraintCircleDraft center={center} radiusMeters={radiusMeters} />
		);
	}
	if (kind === "area") {
		return <AreaCircleDraft center={center} radiusMeters={radiusMeters} />;
	}
	return <ZoneCircleDraft center={center} radiusMeters={radiusMeters} />;
}
