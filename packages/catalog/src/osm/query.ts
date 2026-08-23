import {
	type BBox,
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	multiPolygonToRegion,
	regionContains,
} from "@zero-lag/geo";
import { boundaryLabel } from "./admin-level";
import { type ParsedBoundary, parseBoundaryLine } from "./boundary";

/** The two levels a city game actually picks as include/exclude polygons. */
export type CatalogAdminLevel = 9 | 10;

/**
 * Compact boundary for bbox queries. Identified by OSM type/id because the
 * German official key is missing from almost every Stadtbezirk and Ortsteil.
 */
export interface CatalogBoundary {
	readonly id: string;
	readonly name: string;
	readonly adminLevel: CatalogAdminLevel;
	readonly label: string;
	readonly polygons: MultiPolygon;
	readonly bbox: BBox;
}

export function catalogBoundaryFromParsed(
	parsed: ParsedBoundary,
): CatalogBoundary | null {
	if (parsed.adminLevel !== 9 && parsed.adminLevel !== 10) return null;
	const polygons = parsed.region.polygons;
	const bbox = multiPolygonBBox(polygons);
	if (!bbox) return null;
	return {
		id: `${parsed.osmType}/${parsed.osmId}`,
		name: parsed.name,
		adminLevel: parsed.adminLevel,
		label: boundaryLabel(parsed.adminLevel, parsed.labelPrefix),
		polygons,
		bbox,
	};
}

export function boundariesFromGeojsonseq(text: string): CatalogBoundary[] {
	const out: CatalogBoundary[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		const result = parseBoundaryLine(line);
		if (!result.ok) continue;
		const row = catalogBoundaryFromParsed(result.boundary);
		if (row) out.push(row);
	}
	return out;
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
	return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function bboxArea(bbox: BBox): number {
	return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
}

export function boundariesInBBox(
	catalog: readonly CatalogBoundary[],
	bbox: BBox,
	adminLevel: CatalogAdminLevel,
): CatalogBoundary[] {
	return catalog
		.filter(
			(row) => row.adminLevel === adminLevel && bboxesOverlap(row.bbox, bbox),
		)
		.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function boundaryContaining(
	catalog: readonly CatalogBoundary[],
	point: LngLat,
	adminLevel: CatalogAdminLevel,
): CatalogBoundary | null {
	const hits = catalog.filter(
		(row) =>
			row.adminLevel === adminLevel &&
			regionContains(multiPolygonToRegion(row.polygons), point),
	);
	if (hits.length === 0) return null;
	return hits.reduce((smallest, row) =>
		bboxArea(row.bbox) < bboxArea(smallest.bbox) ? row : smallest,
	);
}
