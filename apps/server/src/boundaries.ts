import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BERLIN_FIXTURE_BOUNDARIES,
	boundariesFromGeojsonseq,
	boundariesInBBox,
	type CatalogAdminLevel,
	type CatalogBoundary,
} from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";
import { FIXTURE_SENTINEL } from "./catalog";

/**
 * Administrative boundaries for seeker include/exclude, held in the process
 * the same way the stop catalog is. Not in Zero: the extract is static and
 * the play map only needs a bbox + level read.
 *
 * Full Germany at every admin level is too large to scan unfiltered. This
 * loader keeps levels 9 and 10 (Bezirk / Ortsteil in Berlin), and the e2e
 * suite uses the fixture when STOP_CATALOG_PATH=fixture.
 */

const JSON_RELATIVE = "assets/catalog/boundaries.catalog.json";
const SEQ_RELATIVE = "assets/osm/boundaries.geojsonseq";

let loaded: readonly CatalogBoundary[] | null = null;

function tryReadJson(path: string): CatalogBoundary[] | null {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"boundaries" in parsed &&
			Array.isArray(parsed.boundaries)
		) {
			return parsed.boundaries as CatalogBoundary[];
		}
		if (Array.isArray(parsed)) return parsed as CatalogBoundary[];
		return null;
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
		const rows = tryReadJson(path);
		if (rows) {
			console.log(`boundaries: ${rows.length} from ${path}`);
			loaded = rows;
			return loaded;
		}
	}

	const seqPaths =
		override?.endsWith(".geojsonseq")
			? [override]
			: [SEQ_RELATIVE, join("..", "..", SEQ_RELATIVE)];
	for (const path of seqPaths) {
		const rows = tryReadSeq(path);
		if (rows && rows.length > 0) {
			console.log(`boundaries: ${rows.length} admin 9/10 from ${path}`);
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
