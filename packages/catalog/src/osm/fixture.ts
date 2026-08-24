import type { MultiPolygon } from "@zero-lag/geo";
import { boundaryLabel } from "./admin-level";
import type { CatalogBoundary } from "./query";

/**
 * Simplified Berlin rectangles that overlap the starter map. Not OSM geometry —
 * the e2e suite and unit tests need known boxes, and CI has no extract.
 *
 * Alexanderplatz (13.4132, 52.5219) sits in both Mitte the Bezirk and Mitte
 * the Ortsteil. Spandau does not overlap the starter map, so a bbox filter
 * has something to drop.
 */

function box(
	id: string,
	name: string,
	adminLevel: 4 | 9 | 10,
	labelPrefix: string,
	west: number,
	south: number,
	east: number,
	north: number,
): CatalogBoundary {
	const polygons: MultiPolygon = [
		[
			[
				[west, south],
				[east, south],
				[east, north],
				[west, north],
				[west, south],
			],
		],
	];
	return {
		id,
		name,
		adminLevel,
		label: boundaryLabel(adminLevel, labelPrefix),
		polygons,
		bbox: [west, south, east, north],
	};
}

export const BERLIN_FIXTURE_BOUNDARIES: readonly CatalogBoundary[] = [
	box("relation/40001", "Berlin", 4, "Land", 13.08, 52.32, 13.77, 52.68),
	box("relation/40002", "Hamburg", 4, "Land", 9.7, 53.4, 10.4, 53.7),
	box("relation/90001", "Mitte", 9, "Bezirk", 13.35, 52.5, 13.44, 52.55),
	box(
		"relation/90002",
		"Friedrichshain-Kreuzberg",
		9,
		"Bezirk",
		13.4,
		52.48,
		13.51,
		52.53,
	),
	box("relation/90003", "Pankow", 9, "Bezirk", 13.38, 52.53, 13.48, 52.57),
	box(
		"relation/90004",
		"Charlottenburg-Wilmersdorf",
		9,
		"Bezirk",
		13.29,
		52.48,
		13.36,
		52.53,
	),
	box(
		"relation/90005",
		"Tempelhof-Schöneberg",
		9,
		"Bezirk",
		13.33,
		52.46,
		13.41,
		52.5,
	),
	box("relation/90006", "Neukölln", 9, "Bezirk", 13.41, 52.46, 13.51, 52.5),
	box("relation/90007", "Spandau", 9, "Bezirk", 13.15, 52.5, 13.25, 52.55),
	box("relation/10001", "Mitte", 10, "Ortsteil", 13.38, 52.51, 13.43, 52.535),
	box(
		"relation/10002",
		"Prenzlauer Berg",
		10,
		"Ortsteil",
		13.41,
		52.53,
		13.46,
		52.56,
	),
	box(
		"relation/10003",
		"Kreuzberg",
		10,
		"Ortsteil",
		13.38,
		52.48,
		13.44,
		52.51,
	),
	box(
		"relation/10004",
		"Friedrichshain",
		10,
		"Ortsteil",
		13.43,
		52.5,
		13.5,
		52.53,
	),
];
