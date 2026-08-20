import {
	type MultiPolygon,
	multiPolygonToRegion,
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

/**
 * Opened on demand rather than at import.
 *
 * Spec files share this module but close it one at a time, in their own
 * `afterAll` — so a pool created once at import is ended by whichever file
 * finishes first and unusable by every file after it. Reopening is the honest
 * shape: `closeDb` means "this file is done with the database", not "nobody
 * will ever need it again".
 */
let pool: Pool | null = null;

function db(): Pool {
	pool ??= new Pool({
		connectionString:
			process.env.DATABASE_URL ??
			"postgresql://postgres:password@localhost:5432/zero-lag",
	});
	return pool;
}

export async function closeDb(): Promise<void> {
	const open = pool;
	pool = null;
	await open?.end();
}

export async function serverSearchAreaHash(gameId: string): Promise<string> {
	const config = await db().query<{
		validHidingArea: MultiPolygon;
	}>('SELECT "validHidingArea" FROM "mapConfig" WHERE "gameId" = $1', [gameId]);
	const row = config.rows[0];
	if (!row) throw new Error(`no map config for game ${gameId}`);

	const constraints = await db().query<{
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

	const seed = multiPolygonToRegion(row.validHidingArea);
	return regionHash(foldConstraints(seed, constraints.rows));
}

export async function answerCount(questionId: string): Promise<number> {
	const result = await db().query<{ count: string }>(
		'SELECT count(*)::text AS count FROM answer WHERE "questionId" = $1',
		[questionId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

export async function eventSeqs(gameId: string): Promise<number[]> {
	const result = await db().query<{ seq: number }>(
		'SELECT seq FROM event WHERE "gameId" = $1 ORDER BY seq',
		[gameId],
	);
	return result.rows.map((row) => row.seq);
}

export async function gameIdForCode(code: string): Promise<string> {
	const result = await db().query<{ id: string }>(
		"SELECT id FROM game WHERE code = $1",
		[code],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error(`no game with code ${code}`);
	return id;
}

/**
 * The whole of "one player, one team", read from the table rather than the
 * screen. m1-spec §5: joining is a move, and the UNIQUE index is what makes it
 * one.
 */
export async function teamMembershipCount(playerId: string): Promise<number> {
	const result = await db().query<{ count: string }>(
		'SELECT count(*)::text AS count FROM "teamMember" WHERE "playerId" = $1',
		[playerId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

/**
 * Identity survives leaving and coming back — the join endpoint returns the
 * *same* player for a known device, which is what makes a rejoin frictionless.
 * m1-spec §7.
 */
export async function playerIdForName(
	code: string,
	displayName: string,
): Promise<string> {
	const result = await db().query<{ id: string }>(
		`SELECT p.id FROM player p
		 JOIN game g ON g.id = p."gameId"
		 WHERE g.code = $1 AND p."displayName" = $2`,
		[code, displayName],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error(`no player ${displayName} in game ${code}`);
	return id;
}

export async function eventTypes(gameId: string): Promise<string[]> {
	const result = await db().query<{ type: string }>(
		'SELECT type FROM event WHERE "gameId" = $1 ORDER BY seq',
		[gameId],
	);
	return result.rows.map((row) => row.type);
}

export async function roundStatuses(gameId: string): Promise<string[]> {
	const result = await db().query<{ status: string }>(
		'SELECT status FROM round WHERE "gameId" = $1 ORDER BY ordinal',
		[gameId],
	);
	return result.rows.map((row) => row.status);
}

/**
 * How many durable snapshots a given team actually has in the table.
 *
 * The query-side half of the visibility rule is only provable against the
 * database: a seeker whose synced count is zero proves nothing on its own if
 * the hiders never wrote anything. m2-spec §13, test 11.
 */
export async function positionCountForTeam(teamId: string): Promise<number> {
	const result = await db().query<{ count: string }>(
		'SELECT count(*)::text AS count FROM "positionSnapshot" WHERE "teamId" = $1',
		[teamId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

export async function teamIdForName(
	code: string,
	name: string,
): Promise<string> {
	const result = await db().query<{ id: string }>(
		`SELECT t.id FROM team t
		 JOIN game g ON g.id = t."gameId"
		 WHERE g.code = $1 AND t.name = $2`,
		[code, name],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error(`no team ${name} in game ${code}`);
	return id;
}

export async function positionCapturedAts(gameId: string): Promise<number[]> {
	const result = await db().query<{ capturedAt: string }>(
		'SELECT "capturedAt" FROM "positionSnapshot" WHERE "gameId" = $1 ORDER BY "capturedAt"',
		[gameId],
	);
	return result.rows.map((row) => Number(row.capturedAt));
}

export async function pinCountForTeam(teamId: string): Promise<number> {
	const result = await db().query<{ count: string }>(
		'SELECT count(*)::text AS count FROM pin WHERE "teamId" = $1',
		[teamId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

export async function pinExists(pinId: string): Promise<boolean> {
	const result = await db().query<{ exists: boolean }>(
		"SELECT EXISTS(SELECT 1 FROM pin WHERE id = $1) AS exists",
		[pinId],
	);
	return result.rows[0]?.exists ?? false;
}

export async function searchZoneCountForRoundTeam(
	roundId: string,
	teamId: string,
): Promise<number> {
	const result = await db().query<{ count: string }>(
		'SELECT count(*)::text AS count FROM "searchZone" WHERE "roundId" = $1 AND "seekerTeamId" = $2',
		[roundId, teamId],
	);
	return Number(result.rows[0]?.count ?? "0");
}

export async function currentRoundId(gameId: string): Promise<string> {
	const result = await db().query<{ id: string }>(
		'SELECT id FROM round WHERE "gameId" = $1 ORDER BY ordinal DESC LIMIT 1',
		[gameId],
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error(`no round for game ${gameId}`);
	return id;
}
