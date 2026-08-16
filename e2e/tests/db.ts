import {
	createProjector,
	type MultiPolygon,
	multiPolygonToRegion,
	type Projection,
	regionHash,
} from "@zero-lag/geo";
import { type Constraint, foldConstraints } from "@zero-lag/rules";
import { Pool } from "pg";

/**
 * The server side of acceptance test 5.
 *
 * The point of that test is that two *processes* agree, so this reads what the
 * database actually holds and folds it in Node with the same pure package the
 * browser used. Asserting the browser against itself would prove nothing.
 */

const pool = new Pool({
	connectionString:
		process.env.DATABASE_URL ??
		"postgresql://postgres:password@localhost:5432/zero-lag",
});

export async function closeDb(): Promise<void> {
	await pool.end();
}

export async function serverSearchAreaHash(gameId: string): Promise<string> {
	const config = await pool.query<{
		projection: Projection;
		validHidingArea: MultiPolygon;
	}>(
		'SELECT projection, "validHidingArea" FROM "mapConfig" WHERE "gameId" = $1',
		[gameId],
	);
	const row = config.rows[0];
	if (!row) throw new Error(`no map config for game ${gameId}`);

	const constraints = await pool.query<{
		id: string;
		geometry: Constraint["geometry"];
		mode: Constraint["mode"];
	}>(
		`SELECT c.id, c.geometry, c.mode
		 FROM "constraint" c
		 JOIN "round" r ON r.id = c."roundId"
		 WHERE r."gameId" = $1 AND c.enabled = true
		 ORDER BY c.ordinal`,
		[gameId],
	);

	const projector = createProjector(row.projection);
	const seed = multiPolygonToRegion(row.validHidingArea, projector);
	return regionHash(foldConstraints(seed, constraints.rows, row.projection));
}

export async function answerCount(questionId: string): Promise<number> {
	const result = await pool.query<{ count: string }>(
		'SELECT count(*)::text AS count FROM answer WHERE "questionId" = $1',
		[questionId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

export async function eventSeqs(gameId: string): Promise<number[]> {
	const result = await pool.query<{ seq: number }>(
		'SELECT seq FROM event WHERE "gameId" = $1 ORDER BY seq',
		[gameId],
	);
	return result.rows.map((row) => row.seq);
}

export async function gameIdForCode(code: string): Promise<string> {
	const result = await pool.query<{ id: string }>(
		"SELECT id FROM game WHERE code = $1",
		[code],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error(`no game with code ${code}`);
	return id;
}

export async function positionCapturedAts(gameId: string): Promise<number[]> {
	const result = await pool.query<{ capturedAt: string }>(
		'SELECT "capturedAt" FROM "positionSnapshot" WHERE "gameId" = $1 ORDER BY "capturedAt"',
		[gameId],
	);
	return result.rows.map((row) => Number(row.capturedAt));
}
