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

/**
 * Levels the area picker offers: Land, Bezirk, and Ortsteil, for the whole
 * German extract. Seeker's include/exclude on the play map still uses 9 and 10.
 */
export const CATALOG_ADMIN_LEVELS = [4, 9, 10] as const;
export type CatalogAdminLevel = (typeof CATALOG_ADMIN_LEVELS)[number];

function isCatalogAdminLevel(level: number): level is CatalogAdminLevel {
	return level === 4 || level === 9 || level === 10;
}

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
	if (!isCatalogAdminLevel(parsed.adminLevel)) return null;
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

/**
 * The place picker searches the whole catalog by name. Sending every Bezirk
 * and Ortsteil in Germany to the phone is not an option; the first hundred
 * after a prefix-biased sort is.
 */
export const BOUNDARY_SEARCH_LIMIT = 100;

export interface BoundarySearch {
	readonly matches: CatalogBoundary[];
	readonly total: number;
}

export function boundariesMatching(
	catalog: readonly CatalogBoundary[],
	adminLevel: CatalogAdminLevel | readonly CatalogAdminLevel[],
	query: string,
	limit: number = BOUNDARY_SEARCH_LIMIT,
	bbox?: BBox | null,
): BoundarySearch {
	const levels = new Set(
		typeof adminLevel === "number" ? [adminLevel] : adminLevel,
	);
	const needle = query.trim().toLowerCase();
	const hits = catalog.filter((row) => {
		if (!levels.has(row.adminLevel)) return false;
		if (bbox && !bboxesOverlap(row.bbox, bbox)) return false;
		if (needle && !row.name.toLowerCase().includes(needle)) return false;
		return true;
	});
	const sorted = hits.slice().sort((a, b) => {
		if (needle) {
			const byRank =
				nameMatchRank(a.name, needle) - nameMatchRank(b.name, needle);
			if (byRank !== 0) return byRank;
		}
		if (a.adminLevel !== b.adminLevel) return a.adminLevel - b.adminLevel;
		return a.name.localeCompare(b.name, "de");
	});
	return { matches: sorted.slice(0, limit), total: sorted.length };
}

function nameMatchRank(name: string, needle: string): number {
	const lower = name.toLowerCase();
	if (lower.startsWith(needle)) return 0;
	if (lower.split(/[\s/-]+/).some((token) => token.startsWith(needle))) {
		return 1;
	}
	return 2;
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
