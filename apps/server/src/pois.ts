import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BERLIN_FIXTURE_POIS,
	type CatalogPoi,
	poisFromGeojsonseq,
	poisFromJson,
	poisInBBox,
} from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";
import { FIXTURE_SENTINEL } from "./catalog";

/**
 * Amenity / tourism / historic / leisure pins, held in the process the same
 * way the boundary catalog is. Not in Zero: the extract is static and the
 * play map only needs a bbox read.
 */

const JSON_RELATIVE = "assets/catalog/pois.catalog.json";
const SEQ_RELATIVE = "assets/osm/pois.geojsonseq";

let loaded: readonly CatalogPoi[] | null = null;

function tryReadJson(path: string): CatalogPoi[] | null {
	try {
		return poisFromJson(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return null;
	}
}

function tryReadSeq(path: string): CatalogPoi[] | null {
	try {
		const rows = poisFromGeojsonseq(readFileSync(path, "utf8"));
		return rows.length > 0 ? rows : null;
	} catch {
		return null;
	}
}

export function loadPois(): readonly CatalogPoi[] {
	if (loaded) return loaded;

	if (
		process.env.STOP_CATALOG_PATH === FIXTURE_SENTINEL ||
		process.env.POIS_PATH === FIXTURE_SENTINEL
	) {
		console.log("pois: using the Berlin fixture, as asked");
		loaded = BERLIN_FIXTURE_POIS;
		return loaded;
	}

	const override = process.env.POIS_PATH;
	const jsonPaths =
		override && !override.endsWith(".geojsonseq")
			? [override]
			: [JSON_RELATIVE, join("..", "..", JSON_RELATIVE)];
	for (const path of jsonPaths) {
		const rows = tryReadJson(path);
		if (rows) {
			console.log(`pois: ${rows.length.toLocaleString()} from ${path}`);
			loaded = rows;
			return loaded;
		}
	}

	const seqPaths = override?.endsWith(".geojsonseq")
		? [override]
		: [SEQ_RELATIVE, join("..", "..", SEQ_RELATIVE)];
	for (const path of seqPaths) {
		const rows = tryReadSeq(path);
		if (rows) {
			console.log(
				`pois: ${rows.length.toLocaleString()} from ${path} (compact with npm run catalog:import:pois)`,
			);
			loaded = rows;
			return loaded;
		}
	}

	console.warn(
		"pois: no catalog or geojsonseq readable; falling back to the Berlin fixture",
	);
	loaded = BERLIN_FIXTURE_POIS;
	return loaded;
}

/** Test seam. Nothing in the running server calls this. */
export function setPois(rows: readonly CatalogPoi[] | null): void {
	loaded = rows;
}

export function poisInView(bbox: BBox): CatalogPoi[] {
	return poisInBBox(loadPois(), bbox);
}
