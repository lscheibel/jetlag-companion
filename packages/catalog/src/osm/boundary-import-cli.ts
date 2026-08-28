import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { type BoundarySkipReason, parseBoundaryLine } from "./boundary";
import {
	CATALOG_ADMIN_LEVELS,
	catalogBoundaryFromParsed,
	isCatalogAdminLevel,
} from "./query";

/**
 * Compact the GeoJSON-seq from `npm run osm:extract` into the JSON the server
 * loads at boot, the way `catalog:import:pois` does for places.
 *
 * `npm run catalog:import:boundaries -- --in assets/osm/boundaries.geojsonseq`
 *
 * The POI compactor earns its 6x by throwing geometry away — a museum becomes
 * a pin. Boundaries cannot: the polygon is the product. The whole saving here
 * is `CATALOG_ADMIN_LEVELS`, which drops the Kreise, Ämter and Gemeinden the
 * picker never offers and takes the artifact from 477 MB to about 174 MB.
 * If that list grows, so does this file — see the note on the constant.
 *
 * Streamed end to end, in and out, which is not a flourish. Reading the seq
 * whole is what `boundariesFromGeojsonseq` does, and at 477 MB it is within
 * sight of V8's ~512 MB maximum string length; the extract only grows. This
 * never holds more than one boundary at a time.
 */

function flag(name: string, fallback: string): string {
	const at = process.argv.indexOf(`--${name}`);
	return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const inPath = flag("in", "assets/osm/boundaries.geojsonseq");
const outPath = flag("out", "assets/catalog/boundaries.catalog.json");

const started = Date.now();
console.log(`==> compacting boundaries from ${inPath}`);

await mkdir(dirname(outPath), { recursive: true });
const out = createWriteStream(outPath, { encoding: "utf8" });

async function write(chunk: string): Promise<void> {
	if (!out.write(chunk)) await once(out, "drain");
}

const perLevel = new Map<number, number>();
const skipped = new Map<BoundarySkipReason, number>();
let kept = 0;
/** Parsed cleanly, then dropped for sitting at a level the picker never offers. */
let otherLevels = 0;
/** Parsed cleanly at a level we keep, but the rings enclose nothing. */
let degenerate = 0;

function tally<K>(counts: Map<K, number>, key: K): void {
	counts.set(key, (counts.get(key) ?? 0) + 1);
}

await write(`{"levels":${JSON.stringify(CATALOG_ADMIN_LEVELS)},"boundaries":[`);

const lines = createInterface({
	input: createReadStream(inPath, { encoding: "utf8" }),
	crlfDelay: Number.POSITIVE_INFINITY,
});

for await (const line of lines) {
	if (!line.trim()) continue;

	const result = parseBoundaryLine(line);
	if (!result.ok) {
		tally(skipped, result.reason);
		continue;
	}
	if (!isCatalogAdminLevel(result.boundary.adminLevel)) {
		otherLevels += 1;
		continue;
	}
	const row = catalogBoundaryFromParsed(result.boundary);
	if (!row) {
		degenerate += 1;
		continue;
	}

	await write(kept === 0 ? JSON.stringify(row) : `,${JSON.stringify(row)}`);
	kept += 1;
	tally(perLevel, row.adminLevel);
}

await write("]}\n");
out.end();
await once(out, "finish");

const written = await stat(outPath);
const count = (n: number) => n.toLocaleString();

console.log();
console.log(
	`==> ${count(kept)} boundaries at levels ${CATALOG_ADMIN_LEVELS.join(", ")}`,
);
for (const level of CATALOG_ADMIN_LEVELS) {
	console.log(`    level ${level} — ${count(perLevel.get(level) ?? 0)}`);
}
console.log(`    ${count(otherLevels)} features at levels we do not keep`);
if (degenerate > 0) {
	console.log(`    ${count(degenerate)} dropped for enclosing no area`);
}
for (const [reason, n] of skipped) {
	console.log(`    ${count(n)} skipped: ${reason}`);
}
console.log(
	`    ${outPath} — ${(written.size / 1e6).toFixed(1)} MB in ${(
		(Date.now() - started) / 1000
	).toFixed(1)}s`,
);
