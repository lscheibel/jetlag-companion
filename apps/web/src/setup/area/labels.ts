import type { BBox } from "@zero-lag/geo";
import type { AreaPieceSource } from "@zero-lag/schema";

/**
 * Wide enough to list every Berlin Bezirk the fixture (and the real extract)
 * carries, including Spandau which sits west of the starter map.
 */
export const BERLIN_BOUNDS: BBox = [13.08, 52.32, 13.77, 52.68];

export const BERLIN_CENTER: readonly [number, number] = [13.4132, 52.5219];

/** The extract is Germany, not Berlin. Empty picker maps open on the country. */
export const GERMANY_BOUNDS: BBox = [5.8, 47.2, 15.1, 55.1];

export function sourceLabel(source: AreaPieceSource): string {
	switch (source) {
		case "city":
			return "Land";
		case "district":
			return "District";
		case "drawn":
			return "Drawn by hand";
		case "circle":
			return "Circle";
		case "file":
			return "From a file";
	}
}
