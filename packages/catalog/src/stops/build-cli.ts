import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { buildStopCatalog } from "./build";

/**
 * `npm run catalog:build -- --gtfs ./assets/gtfs`
 *
 * Points at the dev Postgres by default and creates its own scratch database
 * there, which it drops on the way out. m4-spec §4.
 */

function flag(name: string, fallback: string): string {
	const at = process.argv.indexOf(`--${name}`);
	return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const gtfsDir = flag("gtfs", "assets/gtfs");
const outPath = flag("out", "assets/catalog/stops.catalog.json");
const adminUrl = flag(
	"db",
	process.env.DATABASE_URL ??
		"postgresql://postgres:password@localhost:5432/zero-lag",
);

const started = Date.now();
console.log(`==> building the stop catalog from ${gtfsDir}`);

await mkdir(dirname(outPath), { recursive: true });
const catalog = await buildStopCatalog({
	gtfsDir,
	adminUrl,
	outPath,
	log: (message) => console.log(message),
});

const written = await stat(outPath);
const withModes = catalog.stops.filter((s) => s.modeIds.length > 0).length;

console.log();
console.log(`==> ${catalog.stops.length.toLocaleString()} stations`);
console.log(`    ${withModes.toLocaleString()} with at least one mode`);
console.log(`    version ${catalog.version.slice(0, 16)}…`);
console.log(
	`    ${outPath} — ${(written.size / 1e6).toFixed(1)} MB in ${(
		(Date.now() - started) / 1000
	).toFixed(1)}s`,
);
