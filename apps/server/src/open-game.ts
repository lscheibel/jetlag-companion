import type { BuiltMap } from "@zero-lag/catalog";
import { starterTeams } from "@zero-lag/schema";
import { eq } from "drizzle-orm";
import { type db, drizzleSchema } from "./db";
import { appendEvent, generateJoinCode } from "./game-log";
import { mapEventPayload, starterMap, writeMapConfig } from "./map";

/** A default the host can change in M5, not a rule. */
export const DEFAULT_HIDING_DURATION_MS = 30 * 60_000;

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OpenGameInput {
	readonly displayName: string;
	readonly deviceId: string;
	/**
	 * Scene factories compose their own roster. A real game starts with a
	 * hiding team and a seeking team already on the board.
	 */
	readonly starterTeams?: boolean;
}

export interface OpenedGame {
	readonly gameId: string;
	readonly playerId: string;
	readonly roundId: string;
	readonly code: string;
	readonly mapConfigId: string;
	readonly map: BuiltMap;
}

/**
 * The writes that open a game: a lobby, a starter board, the host, and round 1
 * still pending. Create and the debug scene factories both go through here so
 * a scene is a real game with extra rows, not a parallel insert path.
 */
export async function openGame(
	tx: DbTx,
	input: OpenGameInput,
): Promise<OpenedGame> {
	const gameId = crypto.randomUUID();
	const playerId = crypto.randomUUID();
	const roundId = crypto.randomUUID();
	const now = Date.now();
	const map = starterMap();
	const code = await allocateCode(tx);

	await tx.insert(drizzleSchema.game).values({
		id: gameId,
		code,
		status: "lobby",
		createdByPlayerId: playerId,
		mapConfigId: null,
		eventSeq: 0,
		positionIntervalMs: 30_000,
		createdAt: now,
		startedAt: null,
		endedAt: null,
	});

	/**
	 * A game opens on a starter board so the map, hiding and question screens
	 * have something to draw. The builder replaces it, and the host is
	 * expected to — this is a starting point, not a default anybody should
	 * play on. m4-spec §9.
	 */
	const mapConfigId = await writeMapConfig(tx, {
		gameId,
		map,
		sourceTemplateId: null,
		supersedesConfigId: null,
	});
	await tx
		.update(drizzleSchema.game)
		.set({ mapConfigId })
		.where(eq(drizzleSchema.game.id, gameId));

	await tx.insert(drizzleSchema.player).values({
		id: playerId,
		gameId,
		displayName: input.displayName,
		deviceId: input.deviceId,
		joinedAt: now,
		// The hat starts on whoever opened the game. Anyone may take it
		// afterwards, and this player may put it down. m1-spec §6.
		isHost: true,
		leftAt: null,
		removedByPlayerId: null,
	});

	/**
	 * Round 1 exists from the moment the game does, with `status: "pending"`.
	 *
	 * The build plan wants roles assignable in the lobby; m0-spec §4 says role
	 * belongs to a round and never to a team. Creating the round early settles
	 * both without a role column: the lobby has somewhere to assign into, and
	 * the write it makes is literally the write M5 makes to swap roles for
	 * round 2. m1-spec §3.
	 */
	await tx.insert(drizzleSchema.round).values({
		id: roundId,
		gameId,
		ordinal: 1,
		status: "pending",
		hidingDurationMs: DEFAULT_HIDING_DURATION_MS,
		hidingStartedAt: null,
		seekingStartedAt: null,
		endedAt: null,
	});

	const seeded = (input.starterTeams === false ? [] : starterTeams()).map(
		(team, index) => ({
			...team,
			teamId: crypto.randomUUID(),
			createdAt: now + index,
		}),
	);
	const roles = seeded.map((team) => ({
		teamId: team.teamId,
		role: team.role,
	}));
	for (const team of seeded) {
		await tx.insert(drizzleSchema.team).values({
			id: team.teamId,
			gameId,
			name: team.name,
			color: team.color,
			emoji: team.emoji,
			createdAt: team.createdAt,
		});
		await tx.insert(drizzleSchema.roundTeamRole).values({
			roundId,
			teamId: team.teamId,
			role: team.role,
		});
	}

	await appendEvent(tx, {
		gameId,
		type: "game.created",
		actorPlayerId: playerId,
		payload: { code, mapConfigId },
	});
	await appendEvent(tx, {
		gameId,
		type: "map.applied",
		actorPlayerId: playerId,
		payload: { ...mapEventPayload(mapConfigId, map), templateId: null },
	});
	await appendEvent(tx, {
		gameId,
		type: "player.joined",
		actorPlayerId: playerId,
		payload: { displayName: input.displayName },
	});
	for (const team of seeded) {
		await appendEvent(tx, {
			gameId,
			type: "team.created",
			actorPlayerId: playerId,
			actorTeamId: team.teamId,
			payload: { name: team.name, color: team.color, emoji: team.emoji },
		});
	}
	await appendEvent(tx, {
		gameId,
		type: "round.created",
		actorPlayerId: playerId,
		payload: { roundId, ordinal: 1, roles },
	});

	return { gameId, playerId, roundId, code, mapConfigId, map };
}

async function allocateCode(tx: DbTx): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const code = generateJoinCode();
		const [taken] = await tx
			.select({ id: drizzleSchema.game.id })
			.from(drizzleSchema.game)
			.where(eq(drizzleSchema.game.code, code))
			.limit(1);
		if (!taken) return code;
	}
	throw new Error("could not allocate a unique join code");
}
