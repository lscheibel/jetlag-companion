import {
	type BBox,
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	multiPolygonToRegion,
	regionContains,
} from "@zero-lag/geo";
import { z } from "zod";
import { boundaryLabel } from "./admin-level";
import { type ParsedBoundary, parseBoundaryLine } from "./boundary";

/**
 * Levels the area picker offers: Land, Bezirk, and Ortsteil, for the whole
 * German extract. Seeker's include/exclude on the play map still uses 9 and 10.
 *
 * **Adding a level here is three changes, not one.** `boundaries.catalog.json`
 * is filtered when it is *built*, so widening this list alone gives you a
 * picker that queries a level the artifact was never told to keep and comes
 * back empty:
 *
 *   1. add the level here — `CatalogAdminLevel` and `isCatalogAdminLevel`
 *      both derive from this array, so nothing else in this file needs editing
 *   2. re-run `npm run catalog:import:boundaries` and ship the new artifact;
 *      a server holding the old one is the empty-picker case above
 *   3. confirm the *extract* actually contains the level
 *
 * Step 3 is the one that bites, and country boundaries are the example.
 * `infra/osm/extract-boundaries.sh` filters `r/boundary=administrative` out of
 * a **Germany** .pbf, so level 2 holds exactly two features: Deutschland, and
 * the Deutschland-Belgique border relation. There are no countries in there to
 * offer. Picking countries means extracting from a wider .pbf — europe, planet
 * — and paying for it in size, not widening this list. Level 6 (Kreis) and 8
 * (Gemeinde), by contrast, are already in the extract and cost only bytes:
 * 51 MB and 179 MB of the source seq, against the 174 MB the artifact is now.
 *
 * `BoundaryCatalog.levels` records what an artifact was built with and
 * `missingCatalogLevels` compares it against this array, so a change that
 * stops after step 1 says so at boot instead of at the picker.
 */
export const CATALOG_ADMIN_LEVELS = [4, 9, 10] as const;
export type CatalogAdminLevel = (typeof CATALOG_ADMIN_LEVELS)[number];

const CATALOG_ADMIN_LEVEL_SET: ReadonlySet<number> = new Set(
	CATALOG_ADMIN_LEVELS,
);

export function isCatalogAdminLevel(level: number): level is CatalogAdminLevel {
	return CATALOG_ADMIN_LEVEL_SET.has(level);
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

/**
 * The artifact `npm run catalog:import:boundaries` writes, and what the server
 * loads at boot. The counterpart to `poisFromJson`.
 *
 * `levels` is what the compactor was told to keep, recorded because it is not
 * necessarily what this build of the code asks for — see the note on
 * `CATALOG_ADMIN_LEVELS` and `missingCatalogLevels`.
 */
export interface BoundaryCatalog {
	readonly levels: readonly number[];
	readonly boundaries: CatalogBoundary[];
}

function isPosition(value: unknown): value is LngLat {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number"
	);
}

/**
 * Geometry is checked by probe rather than by schema, and the reason is memory
 * rather than speed.
 *
 * zod rebuilds every value it validates. Descending into the artifact's 7.4
 * million coordinate pairs would therefore hold two copies of the geometry —
 * about 550 MB of them — live at the same instant, and that instant is boot.
 * `z.custom` hands the parsed array straight through instead, so the only
 * copies are the twenty thousand small row objects.
 *
 * What that gives up is narrower than it looks. `JSON.parse` has already
 * proved the file well-formed, the writer is our own compactor, and the ways a
 * format drifts — a renamed field, a level that is no longer offered, a bbox
 * that became an object — are all in the scalars, which are still validated in
 * full. This walks every ring to check nesting and length, and samples each
 * ring's endpoints; it is O(rings), not O(positions).
 */
function looksLikeMultiPolygon(value: unknown): value is MultiPolygon {
	if (!Array.isArray(value) || value.length === 0) return false;
	for (const polygon of value) {
		if (!Array.isArray(polygon) || polygon.length === 0) return false;
		for (const ring of polygon) {
			// A closed ring: first position repeated last, so four is the minimum.
			if (!Array.isArray(ring) || ring.length < 4) return false;
			if (!isPosition(ring[0]) || !isPosition(ring[ring.length - 1])) {
				return false;
			}
		}
	}
	return true;
}

const catalogBoundarySchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	adminLevel: z.literal(CATALOG_ADMIN_LEVELS),
	label: z.string(),
	polygons: z.custom<MultiPolygon>(looksLikeMultiPolygon),
	bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

const boundaryCatalogSchema = z.object({
	levels: z.array(z.number().int()),
	boundaries: z.array(catalogBoundarySchema),
});

/**
 * All-or-nothing on purpose. The file is machine-written and read once at boot,
 * so the failure worth designing for is not a single bad row but the wrong file
 * entirely — a truncated copy, an artifact from a build whose row shape has
 * moved on. Rejecting the lot lets the caller fall through to the extract or
 * the fixture and *say so*, which beats casting a half-understood array into
 * the type system and discovering it at a bbox query.
 */
export function boundaryCatalogFromJson(
	parsed: unknown,
): BoundaryCatalog | null {
	const result = boundaryCatalogSchema.safeParse(parsed);
	return result.success ? result.data : null;
}

/**
 * Levels this build asks for that the artifact was not built with. Non-empty
 * means someone widened `CATALOG_ADMIN_LEVELS` without re-running the
 * compactor, and those levels will come back empty from every query.
 */
export function missingCatalogLevels(
	catalog: BoundaryCatalog,
): CatalogAdminLevel[] {
	const built = new Set(catalog.levels);
	return CATALOG_ADMIN_LEVELS.filter((level) => !built.has(level));
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
