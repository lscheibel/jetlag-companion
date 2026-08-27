import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parsePoiLine } from "./poi";

/**
 * Compact the GeoJSON-seq from `npm run osm:extract:pois` into the JSON the
 * server loads at boot. The seq keeps building footprints; this file is pins.
 *
 * `npm run catalog:import:pois -- --in assets/osm/pois.geojsonseq`
 */

function flag(name: string, fallback: string): string {
	const at = process.argv.indexOf(`--${name}`);
	return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const inPath = flag("in", "assets/osm/pois.geojsonseq");
const outPath = flag("out", "assets/catalog/pois.catalog.json");

const started = Date.now();
console.log(`==> compacting POIs from ${inPath}`);

const text = await readFile(inPath, "utf8");
const pois = [];
let skipped = 0;
for (const line of text.split("\n")) {
	if (!line.trim()) continue;
	const result = parsePoiLine(line);
	if (result.ok) pois.push(result.poi);
	else skipped += 1;
}

pois.sort((a, b) => a.id.localeCompare(b.id));

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify({ pois })}\n`);

console.log(
	`==> ${pois.length.toLocaleString()} places, ${skipped.toLocaleString()} skipped, in ${Date.now() - started}ms`,
);
console.log(`    wrote ${outPath}`);
