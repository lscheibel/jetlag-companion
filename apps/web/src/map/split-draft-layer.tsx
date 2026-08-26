import {
	halfPlaneRegion,
	intersectRegions,
	type LngLat,
	metersPerDegree,
	offsetLngLat,
	type Region,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { cn } from "@zero-lag/ui/lib/utils";
import { useMemo } from "react";
import { yellowBlackLine } from "./draft-paint";
import { lineFeature, multiPolygonFeature, pointsFeature } from "./geojson";
import { MapMarker } from "./map-canvas";
import { useGeoJsonLayer } from "./use-geojson-layer";

const SPAN = yellowBlackLine("split-span", true);
const BISECTOR = yellowBlackLine("split-bisector");
const VERTICES = [
	{
		id: "split-vertices",
		type: "circle" as const,
		paint: {
			"circle-color": "#ffe01f",
			"circle-radius": 8,
			"circle-stroke-color": "#08111c",
			"circle-stroke-width": 2,
		},
	},
];
const CUT_FILL = [
	{
		id: "split-fill",
		type: "fill" as const,
		paint: {
			"fill-color": "#b91c1c",
			"fill-opacity": 0.22,
		},
	},
];

/** How far the preview bisector runs past the span, in metres. */
const BISECTOR_REACH_METERS = 40_000;

interface SplitDraftLayerProps {
	readonly from: LngLat | null;
	readonly to: LngLat | null;
	readonly excludeNearer: "a" | "b";
	readonly surviving: Region | null;
	readonly focus: "from" | "to";
	readonly onFocus: (which: "from" | "to") => void;
}

/**
 * From, to, the span between them, and the orthogonal through the midpoint.
 * The red wash is the half that will be cut from the remaining fold.
 */
export function SplitDraftLayer({
	from,
	to,
	excludeNearer,
	surviving,
	focus,
	onFocus,
}: SplitDraftLayerProps) {
	const span = useMemo(
		() => (from && to ? lineFeature([from, to]) : lineFeature([])),
		[from, to],
	);
	const bisector = useMemo(
		() => lineFeature(from && to ? bisectorLine(from, to) : []),
		[from, to],
	);
	const vertices = useMemo(() => {
		const points: LngLat[] = [];
		if (from) points.push(from);
		if (to) points.push(to);
		return pointsFeature(points);
	}, [from, to]);
	const cut = useMemo(() => {
		if (!from || !to || !surviving) return multiPolygonFeature(null);
		const half = halfPlaneRegion(from, to, excludeNearer);
		return multiPolygonFeature(
			regionToMultiPolygon(intersectRegions(surviving, half)),
		);
	}, [excludeNearer, from, surviving, to]);

	useGeoJsonLayer("split-fill-source", cut, CUT_FILL);
	useGeoJsonLayer("split-span-source", span, SPAN);
	useGeoJsonLayer("split-bisector-source", bisector, BISECTOR);
	useGeoJsonLayer("split-vertices-source", vertices, VERTICES);

	return (
		<>
			{from && (
				<EndMarker
					focused={focus === "from"}
					label="From"
					onFocus={() => onFocus("from")}
					point={from}
					testId="split-from-marker"
				/>
			)}
			{to && (
				<EndMarker
					focused={focus === "to"}
					label="To"
					onFocus={() => onFocus("to")}
					point={to}
					testId="split-to-marker"
				/>
			)}
		</>
	);
}

function EndMarker({
	point,
	label,
	focused,
	onFocus,
	testId,
}: {
	readonly point: LngLat;
	readonly label: string;
	readonly focused: boolean;
	readonly onFocus: () => void;
	readonly testId: string;
}) {
	return (
		<MapMarker lat={point[1]} lng={point[0]}>
			<button
				className="flex min-h-11 flex-col items-center"
				data-testid={testId}
				onClick={onFocus}
				type="button"
			>
				<span
					className={cn(
						"block size-5 shrink-0 rounded-full border-2 shadow",
						focused
							? "border-action bg-action"
							: "border-white bg-surface-raised",
					)}
				/>
				<span className="mt-0.5 rounded-md bg-surface/95 px-1.5 py-0.5 font-semibold text-[0.65rem] leading-tight shadow">
					{label}
				</span>
			</button>
		</MapMarker>
	);
}

function bisectorLine(a: LngLat, b: LngLat): readonly LngLat[] {
	const scale = metersPerDegree((a[1] + b[1]) / 2);
	const dx = (b[0] - a[0]) * scale.lng;
	const dy = (b[1] - a[1]) * scale.lat;
	const length = Math.hypot(dx, dy);
	if (length === 0) return [];
	const midpoint: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const px = -dy / length;
	const py = dx / length;
	return [
		offsetLngLat(
			midpoint,
			px * BISECTOR_REACH_METERS,
			py * BISECTOR_REACH_METERS,
		),
		offsetLngLat(
			midpoint,
			-px * BISECTOR_REACH_METERS,
			-py * BISECTOR_REACH_METERS,
		),
	];
}
