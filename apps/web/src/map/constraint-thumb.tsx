import {
	intersectRegions,
	isEmptyRegion,
	type LngLat,
	type MultiPolygon,
	metersPerDegree,
	multiPolygonBBox,
	multiPolygonToRegion,
	type Region,
	regionToMultiPolygon,
	simplifyRegion,
} from "@zero-lag/geo";
import { type ConstraintGeometry, toRegion } from "@zero-lag/rules";
import { cn } from "@zero-lag/ui/lib/utils";
import { constraintKindLabel } from "./toolkit";

/**
 * A cut, drawn small enough to sit on its own row.
 *
 * The point of the picture is that the frame never changes: every thumbnail in
 * the list shows the same silhouette of the game area at the same scale, so
 * the eye compares *where the cut is* instead of re-reading the shape of the
 * city fourteen times. Deck 12 R1. A thumbnail that re-framed itself per cut
 * would look better one at a time and be useless as a list.
 */

/** Drawn at 26 px; the viewBox is in the same units so 1 unit is 1 px. */
export const THUMB_SIZE = 26;

/** Room for the outline's stroke, and for a cut that runs off the edge. */
const PAD = 1.5;

export type ThumbFrame = {
	/** The game area's silhouette, already projected. */
	readonly outline: string;
	/** The box every cut is clipped to, so a 40 km circle stays 26 px. */
	readonly clip: Region;
	/** One thumbnail pixel, in metres: the simplification tolerance. */
	readonly toleranceMeters: number;
	readonly project: (point: LngLat) => readonly [number, number];
};

/**
 * The frame, from the game's valid hiding area. Computed once per game — it
 * does not move when the fold does, which is the whole reason the thumbnails
 * are comparable.
 */
export function thumbFrame(seed: MultiPolygon | null): ThumbFrame | null {
	if (!seed || seed.length === 0) return null;
	const bbox = multiPolygonBBox(seed);
	if (!bbox) return null;

	const [west, south, east, north] = bbox;
	const midLng = (west + east) / 2;
	const midLat = (south + north) / 2;
	// Latitude-corrected, so a circle on the ground is a circle on the row
	// rather than an ellipse squashed by Berlin's 68 km degree of longitude.
	const scale = metersPerDegree(midLat);
	const widthMeters = Math.max((east - west) * scale.lng, 1);
	const heightMeters = Math.max((north - south) * scale.lat, 1);
	const box = THUMB_SIZE - PAD * 2;
	const pxPerMeter = Math.min(box / widthMeters, box / heightMeters);
	const half = THUMB_SIZE / 2;

	const project = (point: LngLat): readonly [number, number] => [
		half + (point[0] - midLng) * scale.lng * pxPerMeter,
		half - (point[1] - midLat) * scale.lat * pxPerMeter,
	];

	const toleranceMeters = 1 / pxPerMeter;
	const clip = boxRegion(
		bbox,
		widthMeters / scale.lng,
		heightMeters / scale.lat,
	);

	return {
		clip,
		outline: pathFor(
			regionToMultiPolygon(
				simplifyRegion(multiPolygonToRegion(seed), toleranceMeters),
			),
			project,
		),
		project,
		toleranceMeters,
	};
}

/**
 * Null when the cut and the game area do not overlap at all — which is a real
 * state (a circle drawn well outside the board) and draws as an empty frame
 * rather than as a stray mark in the corner.
 */
export function constraintThumbPath(
	geometry: ConstraintGeometry,
	frame: ThumbFrame,
): string | null {
	const clipped = intersectRegions(toRegion(geometry), frame.clip);
	if (isEmptyRegion(clipped)) return null;
	const path = pathFor(
		regionToMultiPolygon(simplifyRegion(clipped, frame.toleranceMeters)),
		frame.project,
	);
	return path === "" ? null : path;
}

interface ConstraintThumbProps {
	readonly frame: ThumbFrame | null;
	readonly geometry: ConstraintGeometry;
	readonly mode: "include" | "exclude";
	readonly className?: string;
}

/**
 * The sign lives in the fill: vermillion for a cut, green for a keep. That is
 * why the row needs no separate +/- chip.
 */
export function ConstraintThumb({
	frame,
	geometry,
	mode,
	className,
}: ConstraintThumbProps) {
	const cut = mode === "exclude";
	const path = frame ? constraintThumbPath(geometry, frame) : null;
	return (
		/*
		 * Not decorative: on a collapsed row the shape word lives only in the
		 * picture, because the row's text is the cut's own name.
		 */
		<svg
			aria-label={`${constraintKindLabel(geometry)}, ${cut ? "cut" : "kept"}`}
			className={cn(
				"size-[26px] shrink-0 rounded-[7px] border border-hairline",
				className,
			)}
			role="img"
			viewBox={`0 0 ${THUMB_SIZE} ${THUMB_SIZE}`}
		>
			<rect
				className="fill-map-land"
				height={THUMB_SIZE}
				width={THUMB_SIZE}
				x="0"
				y="0"
			/>
			{frame && (
				<path
					className="fill-map-hiding-area/25 stroke-map-hiding-area"
					d={frame.outline}
					fillRule="evenodd"
					strokeWidth="0.9"
				/>
			)}
			{path && (
				<path
					className={
						cut ? "fill-danger/35 stroke-danger" : "fill-live/35 stroke-live"
					}
					d={path}
					fillRule="evenodd"
					strokeWidth="1"
				/>
			)}
		</svg>
	);
}

/** The bounding box as a region, padded by a quarter so a cut that leaves the
 * area still shows which way it went. */
function boxRegion(
	bbox: readonly [number, number, number, number],
	spanLng: number,
	spanLat: number,
): Region {
	const padLng = spanLng * 0.25;
	const padLat = spanLat * 0.25;
	const west = bbox[0] - padLng;
	const south = bbox[1] - padLat;
	const east = bbox[2] + padLng;
	const north = bbox[3] + padLat;
	return {
		polygons: [
			[
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south],
				],
			],
		],
	};
}

function pathFor(
	polygons: MultiPolygon,
	project: (point: LngLat) => readonly [number, number],
): string {
	const parts: string[] = [];
	for (const polygon of polygons) {
		for (const ring of polygon) {
			if (ring.length < 3) continue;
			const points = ring.map((point) => {
				const [x, y] = project(point);
				return `${round(x)} ${round(y)}`;
			});
			parts.push(`M${points.join("L")}Z`);
		}
	}
	return parts.join("");
}

/** Two decimals is a hundredth of a thumbnail pixel; the rest is payload. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}
