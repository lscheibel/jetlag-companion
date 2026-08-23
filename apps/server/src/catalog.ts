import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BERLIN_FIXTURE_CATALOG,
	type CatalogStop,
	type StopCatalog,
	stopsInBBox,
} from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";

/**
 * The stop catalog, held in the process. m4-spec §2.
 *
 * 24.7 MB read once at startup, because the only query anything runs over it is
 * a bounding box — which over a quarter-million points in memory is a linear
 * scan measured in tens of milliseconds, on a screen a host opens once. An
 * indexed table, a second database and a connection pool would be a great deal
 * of apparatus for a filter.
 *
 * When the artifact is missing the server falls back to the twelve-station
 * Berlin fixture and says so, loudly. That is what lets the e2e suite run
 * without a 2 GB feed, and it is deliberately a *visible* degradation: a server
 * quietly serving twelve stations while a host wonders where Hamburg went would
 * be a miserable afternoon.
 */

const RELATIVE_PATH = "assets/catalog/stops.catalog.json";

/**
 * `npm run dev` starts the server with its own package as the working
 * directory; the build script and the e2e harness run from the repo root.
 * Rather than depend on which, try both — and let `STOP_CATALOG_PATH` override
 * for a deployment that puts the artifact somewhere else entirely.
 */
/**
 * `STOP_CATALOG_PATH=fixture` asks for the twelve-station Berlin fixture on
 * purpose. The acceptance suite uses it: CI has no 2 GB feed to build the real
 * catalog from, and a suite whose station counts depend on which feed the
 * machine happens to hold is a suite that fails for reasons nobody can read.
 */
export const FIXTURE_SENTINEL = "fixture";

function candidatePaths(): string[] {
	const override = process.env.STOP_CATALOG_PATH;
	return override
		? [override]
		: [RELATIVE_PATH, join("..", "..", RELATIVE_PATH)];
}

let loaded: StopCatalog | null = null;

export function loadCatalog(): StopCatalog {
	if (loaded) return loaded;

	if (process.env.STOP_CATALOG_PATH === FIXTURE_SENTINEL) {
		console.log("catalog: using the Berlin fixture, as asked");
		loaded = BERLIN_FIXTURE_CATALOG;
		return loaded;
	}

	const tried: string[] = [];
	for (const path of candidatePaths()) {
		try {
			const parsed: StopCatalog = JSON.parse(readFileSync(path, "utf8"));
			console.log(
				`catalog: ${parsed.stops.length.toLocaleString()} stations from ${path}, version ${parsed.version.slice(0, 12)}`,
			);
			loaded = parsed;
			return loaded;
		} catch {
			tried.push(path);
		}
	}

	console.warn(
		`catalog: none of ${tried.join(", ")} could be read. ` +
			"Falling back to the twelve-station Berlin fixture — " +
			"run `npm run catalog:build` for the real one.",
	);
	loaded = BERLIN_FIXTURE_CATALOG;
	return loaded;
}

/** Test seam. Nothing in the running server calls this. */
export function setCatalog(catalog: StopCatalog | null): void {
	loaded = catalog;
}

export function catalogStops(): readonly CatalogStop[] {
	return loadCatalog().stops;
}

export function catalogVersion(): string {
	return loadCatalog().version;
}

export function stopsInView(bbox: BBox): CatalogStop[] {
	return stopsInBBox(catalogStops(), bbox);
}
