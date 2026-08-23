import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { stopCatalogVersion } from "../map/content-hash";
import { parseCsv, splitCsvLine } from "./csv";
import { classifyRoute } from "./modes";
import type { CatalogStop, StopCatalog } from "./types";

/**
 * Build the stop catalog from a GTFS feed. m4-spec §4.
 *
 * Postgres does the work and then goes away. The 36-million-row join that says
 * which modes call at which station is `COPY` plus one `SELECT DISTINCT`, which
 * is the right tool and which a streaming parse in JavaScript is not — but that
 * argues for Postgres *during the build*, not forever. Everything here runs
 * against a scratch database that is created at the start and dropped at the
 * end, the same shape as `npm run osm:extract`: a heavyweight tool doing one
 * offline pass and leaving a compact file behind.
 *
 * Needs roughly 3 GB of transient disk. That is a fact about the build host and
 * not about anything that ships.
 */

/** Only the columns the build reads; the rest are copied and ignored. */
const FEED_FILES = ["stops", "trips", "routes", "stop_times"] as const;
type FeedFile = (typeof FEED_FILES)[number];

export interface BuildOptions {
	/** Directory holding stops.txt, trips.txt, routes.txt, stop_times.txt. */
	readonly gtfsDir: string;
	/** A connection to any existing database on the target server. */
	readonly adminUrl: string;
	readonly scratchDatabase?: string;
	/** Where to write the artifact. */
	readonly outPath: string;
	readonly log?: (message: string) => void;
}

export async function buildStopCatalog(
	options: BuildOptions,
): Promise<StopCatalog> {
	const scratch = options.scratchDatabase ?? "zero_lag_catalog_build";
	const log = options.log ?? (() => {});

	const admin = new Client({ connectionString: options.adminUrl });
	await admin.connect();
	try {
		// A leftover from a failed run would silently be reused. Rebuild it.
		await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(scratch)}`);
		await admin.query(`CREATE DATABASE ${quoteIdent(scratch)}`);
	} finally {
		await admin.end();
	}

	const client = new Client({
		connectionString: scratchUrl(options.adminUrl, scratch),
	});
	await client.connect();

	try {
		for (const file of FEED_FILES) {
			const started = Date.now();
			const rows = await copyFeedFile(client, options.gtfsDir, file);
			log(
				`  ${file}.txt: ${rows.toLocaleString()} rows in ${elapsed(started)}`,
			);
		}

		log("  joining stop_times → trips → routes");
		const started = Date.now();
		await client.query(`
			CREATE UNLOGGED TABLE stop_route AS
			SELECT DISTINCT t.route_id,
			       COALESCE(NULLIF(s.parent_station, ''), s.stop_id) AS station_id
			FROM gtfs_stop_times st
			JOIN gtfs_trips  t ON t.trip_id = st.trip_id
			JOIN gtfs_stops  s ON s.stop_id = st.stop_id
		`);
		log(`  stop_route built in ${elapsed(started)}`);

		await loadRouteModes(client, options.gtfsDir);
		const stops = await foldStations(client);
		const feedPublisher = await readFeedPublisher(options.gtfsDir);

		const catalog: StopCatalog = {
			version: stopCatalogVersion(stops),
			feedPublisher,
			builtAt: Date.now(),
			stops,
		};
		await writeFile(options.outPath, JSON.stringify(catalog), "utf8");
		return catalog;
	} finally {
		await client.end();
		const cleanup = new Client({ connectionString: options.adminUrl });
		await cleanup.connect();
		try {
			await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdent(scratch)}`);
		} finally {
			await cleanup.end();
		}
	}
}

/**
 * Create a table from the file's own header and copy into it.
 *
 * Every column arrives as `text`, and the column list comes from the header
 * rather than from a hard-coded schema — GTFS does not fix column order, and a
 * feed that adds a column should not break the build.
 */
async function copyFeedFile(
	client: Client,
	gtfsDir: string,
	file: FeedFile,
): Promise<number> {
	const path = join(gtfsDir, `${file}.txt`);
	const columns = await readHeader(path);
	const table = `gtfs_${file}`;

	await client.query(
		`CREATE UNLOGGED TABLE ${quoteIdent(table)} (${columns
			.map((column) => `${quoteIdent(column)} text`)
			.join(", ")})`,
	);

	const target = `${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})`;
	const stream = client.query(
		copyFrom(`COPY ${target} FROM STDIN WITH (FORMAT csv, HEADER true)`),
	);
	await pipeline(createReadStream(path), stream);

	const counted = await client.query<{ count: string }>(
		`SELECT count(*)::text AS count FROM ${quoteIdent(table)}`,
	);
	return Number(counted.rows[0]?.count ?? 0);
}

/**
 * Classify routes in JavaScript and send the answers back as a table.
 *
 * The heuristic belongs in `modes.ts` where it is tested, not in SQL where it
 * would be a second copy to keep in step — and 24,828 rows is a small thing to
 * hand back.
 */
async function loadRouteModes(client: Client, gtfsDir: string): Promise<void> {
	const routes = parseCsv(await readFile(join(gtfsDir, "routes.txt"), "utf8"));
	await client.query(
		"CREATE UNLOGGED TABLE route_mode (route_id text, mode_id text)",
	);

	const values: string[] = [];
	for (const route of routes) {
		const mode = classifyRoute(
			Number(route.route_type),
			route.route_short_name ?? "",
		);
		if (!mode || !route.route_id) continue;
		values.push(`(${quoteLiteral(route.route_id)},${quoteLiteral(mode)})`);
	}
	for (let i = 0; i < values.length; i += 1000) {
		await client.query(
			`INSERT INTO route_mode VALUES ${values.slice(i, i + 1000).join(",")}`,
		);
	}
	await client.query("CREATE INDEX ON route_mode (route_id)");
}

/**
 * Fold platforms into stations and roll the modes up onto them.
 *
 * 99.6% of platform rows declare a `parent_station`, so this is a stated
 * relation rather than the name-and-radius heuristic an earlier draft budgeted
 * for. The 1,558 rows with no parent are promoted to stations as themselves.
 */
async function foldStations(client: Client): Promise<CatalogStop[]> {
	await client.query(`
		CREATE UNLOGGED TABLE station AS
		SELECT stop_id AS id, stop_name AS name,
		       stop_lon::double precision AS lng, stop_lat::double precision AS lat
		FROM gtfs_stops WHERE location_type = '1'
		UNION ALL
		SELECT stop_id, stop_name,
		       stop_lon::double precision, stop_lat::double precision
		FROM gtfs_stops
		WHERE COALESCE(NULLIF(parent_station, ''), '') = ''
		  AND COALESCE(NULLIF(location_type, ''), '0') = '0'
	`);

	const result = await client.query<{
		id: string;
		name: string;
		lng: number;
		lat: number;
		mode_ids: string[] | null;
	}>(`
		SELECT s.id, s.name, s.lng, s.lat, m.mode_ids
		FROM station s
		LEFT JOIN (
			SELECT sr.station_id,
			       array_agg(DISTINCT rm.mode_id ORDER BY rm.mode_id) AS mode_ids
			FROM stop_route sr
			JOIN route_mode rm ON rm.route_id = sr.route_id
			GROUP BY sr.station_id
		) m ON m.station_id = s.id
		ORDER BY s.id
	`);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		lng: row.lng,
		lat: row.lat,
		modeIds: row.mode_ids ?? [],
	}));
}

async function readFeedPublisher(gtfsDir: string): Promise<string> {
	try {
		const rows = parseCsv(
			await readFile(join(gtfsDir, "feed_info.txt"), "utf8"),
		);
		return rows[0]?.feed_publisher_name ?? "unknown";
	} catch {
		return "unknown";
	}
}

async function readHeader(path: string): Promise<string[]> {
	const stream = createReadStream(path, { encoding: "utf8", end: 64 * 1024 });
	let head = "";
	for await (const chunk of stream) {
		head += chunk;
		const newline = head.indexOf("\n");
		if (newline !== -1) {
			stream.destroy();
			return splitCsvLine(head.slice(0, newline).replace(/\r$/, ""));
		}
	}
	throw new Error(`${path} has no header line`);
}

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function scratchUrl(adminUrl: string, database: string): string {
	const url = new URL(adminUrl);
	url.pathname = `/${database}`;
	return url.toString();
}

function elapsed(since: number): string {
	return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}
