import type { StoredMultiPolygon } from "@zero-lag/schema";
import { useMemo } from "react";

/**
 * The game area as a picture, before it is a number.
 *
 * Deliberately not a map: this is a shape on a card in a briefing, drawn from
 * the polygon the game already carries, so it costs no tiles, no network and no
 * MapLibre — all three of which are the wrong price for a decoration that has
 * to render on a platform with one bar. "400 m" means something next to the
 * shape it applies to; it does not need street names to do that.
 */

interface AreaThumbnailProps {
	area: StoredMultiPolygon | null;
	className?: string;
}

const WIDTH = 320;
const HEIGHT = 104;
const PADDING = 8;

export function AreaThumbnail({ area, className }: AreaThumbnailProps) {
	const paths = useMemo(() => project(area), [area]);

	return (
		<svg
			aria-label="The game area"
			className={className}
			role="img"
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
		>
			<rect fill="var(--map-land)" height={HEIGHT} width={WIDTH} />
			{paths.map((path) => (
				<path
					d={path}
					fill="var(--map-hiding-area)"
					fillOpacity="0.16"
					key={path}
					stroke="var(--map-hiding-area)"
					strokeLinejoin="round"
					strokeWidth="2.5"
				/>
			))}
		</svg>
	);
}

/**
 * Fit to the box, keeping the aspect ratio, with latitude flipped because
 * north is up on a screen and up is a smaller y.
 */
function project(area: StoredMultiPolygon | null): readonly string[] {
	if (!area || area.length === 0) return [];

	let minLng = 180;
	let minLat = 90;
	let maxLng = -180;
	let maxLat = -90;
	for (const polygon of area) {
		for (const ring of polygon) {
			for (const [lng, lat] of ring) {
				minLng = Math.min(minLng, lng);
				minLat = Math.min(minLat, lat);
				maxLng = Math.max(maxLng, lng);
				maxLat = Math.max(maxLat, lat);
			}
		}
	}

	const spanLng = maxLng - minLng || 1;
	const spanLat = maxLat - minLat || 1;
	const scale = Math.min(
		(WIDTH - PADDING * 2) / spanLng,
		(HEIGHT - PADDING * 2) / spanLat,
	);
	const offsetX = (WIDTH - spanLng * scale) / 2;
	const offsetY = (HEIGHT - spanLat * scale) / 2;

	return area.flatMap((polygon) =>
		polygon.map(
			(ring) =>
				`${ring
					.map(([lng, lat], index) => {
						const x = offsetX + (lng - minLng) * scale;
						const y = offsetY + (maxLat - lat) * scale;
						return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
					})
					.join(" ")}Z`,
		),
	);
}
