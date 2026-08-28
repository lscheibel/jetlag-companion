import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BERLIN_FIXTURE_BOUNDARIES,
	BOUNDARY_SEARCH_LIMIT,
	type BoundaryCatalog,
	boundariesFromGeojsonseq,
	boundariesInBBox,
	boundariesMatching,
	boundaryCatalogFromJson,
	CATALOG_ADMIN_LEVELS,
	type CatalogAdminLevel,
	type CatalogBoundary,
	missingCatalogLevels,
} from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";
import { FIXTURE_SENTINEL } from "./catalog";

/**
 * Administrative boundaries for seeker include/exclude, held in the process
 * the same way the stop catalog is. Not in Zero: the extract is static and
 * the play map only needs a bbox + level read.
 *
 * Full Germany at every admin level is too large to send unfiltered, so only
 * `CATALOG_ADMIN_LEVELS` — 4, 9 and 10, Land / Bezirk / Ortsteil — is kept.
 *
 * Three sources, in order. The compacted artifact from
 * `npm run catalog:import:boundaries` is what a deployment ships. The raw
 * extract is the development fallback and costs about 300 MB of parsing for
 * levels that are then discarded. The Berlin fixture is last, and the e2e
 * suite asks for it by name with STOP_CATALOG_PATH=fixture.
 */

const JSON_RELATIVE = "assets/catalog/boundaries.catalog.json";
const SEQ_RELATIVE = "assets/osm/boundaries.geojsonseq";

let loaded: readonly CatalogBoundary[] | null = null;

function tryReadCatalog(path: string): BoundaryCatalog | null {
	try {
		return boundaryCatalogFromJson(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return null;
	}
}

function tryReadSeq(path: string): CatalogBoundary[] | null {
	try {
		return boundariesFromGeojsonseq(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

export function loadBoundaries(): readonly CatalogBoundary[] {
	if (loaded) return loaded;

	if (
		process.env.STOP_CATALOG_PATH === FIXTURE_SENTINEL ||
		process.env.BOUNDARIES_PATH === FIXTURE_SENTINEL
	) {
		console.log("boundaries: using the Berlin fixture, as asked");
		loaded = BERLIN_FIXTURE_BOUNDARIES;
		return loaded;
	}

	const override = process.env.BOUNDARIES_PATH;
	const jsonPaths =
		override && !override.endsWith(".geojsonseq")
			? [override]
			: [JSON_RELATIVE, join("..", "..", JSON_RELATIVE)];
	for (const path of jsonPaths) {
		const catalog = tryReadCatalog(path);
		if (!catalog) continue;

		// A widened CATALOG_ADMIN_LEVELS against an artifact built before the
		// change is a silently empty picker, so say it here rather than let a
		// host wonder why their Kreis is not in the list.
		const missing = missingCatalogLevels(catalog);
		if (missing.length > 0) {
			console.warn(
				`boundaries: ${path} was built for levels ${catalog.levels.join(", ")}, ` +
					`but this build asks for ${CATALOG_ADMIN_LEVELS.join(", ")}. ` +
					`Level ${missing.join(", ")} will come back empty — ` +
					"re-run `npm run catalog:import:boundaries`.",
			);
		}

		console.log(
			`boundaries: ${catalog.boundaries.length.toLocaleString()} from ${path}`,
		);
		loaded = catalog.boundaries;
		return loaded;
	}

	const seqPaths = override?.endsWith(".geojsonseq")
		? [override]
		: [SEQ_RELATIVE, join("..", "..", SEQ_RELATIVE)];
	for (const path of seqPaths) {
		const rows = tryReadSeq(path);
		if (rows && rows.length > 0) {
			console.log(
				`boundaries: ${rows.length.toLocaleString()} at levels ` +
					`${CATALOG_ADMIN_LEVELS.join(", ")} from ${path} ` +
					"(compact with `npm run catalog:import:boundaries`)",
			);
			loaded = rows;
			return loaded;
		}
	}

	console.warn(
		"boundaries: no catalog or geojsonseq readable; falling back to the Berlin fixture",
	);
	loaded = BERLIN_FIXTURE_BOUNDARIES;
	return loaded;
}

/** Test seam. Nothing in the running server calls this. */
export function setBoundaries(rows: readonly CatalogBoundary[] | null): void {
	loaded = rows;
}

export function boundariesInView(
	bbox: BBox,
	adminLevel: CatalogAdminLevel,
): CatalogBoundary[] {
	return boundariesInBBox(loadBoundaries(), bbox, adminLevel);
}

export function boundariesNamed(
	adminLevels: CatalogAdminLevel | readonly CatalogAdminLevel[],
	query: string,
	bbox?: BBox | null,
): { matches: CatalogBoundary[]; total: number } {
	return boundariesMatching(
		loadBoundaries(),
		adminLevels,
		query,
		BOUNDARY_SEARCH_LIMIT,
		bbox,
	);
}

export function boundaryCountAtLevels(
	adminLevels: readonly CatalogAdminLevel[],
): number {
	const wanted = new Set(adminLevels);
	let count = 0;
	for (const row of loadBoundaries()) {
		if (wanted.has(row.adminLevel)) count += 1;
	}
	return count;
}
