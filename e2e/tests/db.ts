import {
	type MultiPolygon,
	multiPolygonToRegion,
	regionArea,
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
	// Through game.mapConfigId, not by gameId: since M4 a game keeps its
	// superseded configs so a replay can reconstruct which board was in force
	// when, and picking whichever row came back first would be picking at random.
	const config = await db().query<{
		validHidingArea: MultiPolygon;
	}>(
		`SELECT c."validHidingArea"
		 FROM "game" g JOIN "mapConfig" c ON c.id = g."mapConfigId"
		 WHERE g.id = $1`,
		[gameId],
	);
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

/** Set the pending round's clock. Used when a test needs a duration the UI no longer types. */
export async function setPendingHidingDuration(
	code: string,
	minutes: string,
): Promise<void> {
	const gameId = await gameIdForCode(code);
	const hidingDurationMs = Math.round(Number(minutes) * 60_000);
	await db().query(
		`UPDATE round SET "hidingDurationMs" = $1
		 WHERE "gameId" = $2 AND status = 'pending'`,
		[hidingDurationMs, gameId],
	);
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

// --- M4 -------------------------------------------------------------------

export type StoredMapConfig = {
	readonly id: string;
	readonly name: string;
	readonly scalePreset: string;
	readonly hidingRadiusMeters: number;
	readonly contentHash: string;
	readonly catalogVersion: string;
	readonly validHidingArea: MultiPolygon;
	readonly supersedesConfigId: string | null;
};

/** The board a game is currently on — the config `game.mapConfigId` points at. */
export async function currentMapConfig(
	gameId: string,
): Promise<StoredMapConfig> {
	const result = await db().query<StoredMapConfig>(
		`SELECT c.id, c.name, c."scalePreset", c."hidingRadiusMeters", c."contentHash",
		        c."catalogVersion", c."validHidingArea", c."supersedesConfigId"
		 FROM "game" g JOIN "mapConfig" c ON c.id = g."mapConfigId"
		 WHERE g.id = $1`,
		[gameId],
	);
	const config = result.rows[0];
	if (!config) throw new Error(`game ${gameId} has no map config`);
	return config;
}

/** Every stop the board carries, in the order the config wrote them. */
export async function mapStops(
	mapConfigId: string,
): Promise<{ stopId: string; name: string; insideArea: boolean }[]> {
	const result = await db().query<{
		stopId: string;
		name: string;
		insideArea: boolean;
	}>(
		`SELECT "stopId", "name", "insideArea" FROM "mapStop"
		 WHERE "mapConfigId" = $1 ORDER BY "stopId"`,
		[mapConfigId],
	);
	return result.rows;
}

export async function templateCount(): Promise<number> {
	const result = await db().query<{ count: string }>(
		`SELECT count(*)::text AS count FROM "mapTemplate"`,
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** `map.applied` and `map.changed`, with the seq the log gave them. */
export async function mapEvents(
	gameId: string,
): Promise<{ type: string; seq: number; name: string }[]> {
	const result = await db().query<{ type: string; seq: number; name: string }>(
		`SELECT type, seq, payload->>'name' AS name FROM "event"
		 WHERE "gameId" = $1 AND type LIKE 'map.%' ORDER BY seq`,
		[gameId],
	);
	return result.rows;
}

/** The area's size on the ground, for the bowtie assertion. m4-spec §3. */
export function areaSquareMeters(area: MultiPolygon): number {
	return regionArea(multiPolygonToRegion(area));
}

/** The zone a hider team committed, for asserting it did not move. */
export async function committedZone(
	roundId: string,
	hiderTeamId: string,
): Promise<{ stopId: string; zone: MultiPolygon } | null> {
	const result = await db().query<{ stopId: string; zone: MultiPolygon }>(
		`SELECT "stopId", zone FROM "hidingCommitment"
		 WHERE "roundId" = $1 AND "hiderTeamId" = $2`,
		[roundId, hiderTeamId],
	);
	return result.rows[0] ?? null;
}

// --- M5 -------------------------------------------------------------------

export async function houseRulesText(gameId: string): Promise<string | null> {
	const result = await db().query<{ text: string }>(
		'SELECT "text" FROM "houseRules" WHERE "gameId" = $1',
		[gameId],
	);
	return result.rows[0]?.text ?? null;
}

export async function pausesForRound(roundId: string): Promise<
	{
		id: string;
		reason: string;
		startedAt: number;
		endedAt: number | null;
	}[]
> {
	const result = await db().query<{
		id: string;
		reason: string;
		startedAt: string;
		endedAt: string | null;
	}>(
		`SELECT id, reason, "startedAt", "endedAt" FROM "roundPause"
		 WHERE "roundId" = $1 ORDER BY "startedAt"`,
		[roundId],
	);
	return result.rows.map((row) => ({
		id: row.id,
		reason: row.reason,
		startedAt: Number(row.startedAt),
		endedAt: row.endedAt === null ? null : Number(row.endedAt),
	}));
}

export async function hiderOutcomes(roundId: string): Promise<
	{
		hiderTeamId: string;
		seekerTeamId: string | null;
		foundAt: number | null;
		durationMillis: number | null;
		photoId: string | null;
	}[]
> {
	const result = await db().query<{
		hiderTeamId: string;
		seekerTeamId: string | null;
		foundAt: string | null;
		durationMillis: string | null;
		photoId: string | null;
	}>(
		`SELECT "hiderTeamId", "seekerTeamId", "foundAt", "durationMillis", "photoId"
		 FROM "hiderOutcome" WHERE "roundId" = $1`,
		[roundId],
	);
	return result.rows.map((row) => ({
		hiderTeamId: row.hiderTeamId,
		seekerTeamId: row.seekerTeamId,
		foundAt: row.foundAt === null ? null : Number(row.foundAt),
		durationMillis:
			row.durationMillis === null ? null : Number(row.durationMillis),
		photoId: row.photoId,
	}));
}

export async function photoRow(photoId: string): Promise<{
	sha256: string;
	gameId: string;
	byteSize: number;
} | null> {
	const result = await db().query<{
		sha256: string;
		gameId: string;
		byteSize: number;
	}>('SELECT sha256, "gameId", "byteSize" FROM photo WHERE id = $1', [photoId]);
	return result.rows[0] ?? null;
}

export async function eventPayloads(
	gameId: string,
	type: string,
): Promise<unknown[]> {
	const result = await db().query<{ payload: unknown }>(
		'SELECT payload FROM event WHERE "gameId" = $1 AND type = $2 ORDER BY seq',
		[gameId, type],
	);
	return result.rows.map((row) => row.payload);
}
