import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { issueGameToken } from "../auth";
import { db, drizzleSchema } from "../db";
import { appendEvent, generateJoinCode } from "../game-log";
import { mapEventPayload, starterMap, writeMapConfig } from "../map";

/**
 * Joining is plain HTTP rather than a Zero mutator, because a token has to
 * exist before Zero can be pointed at anything. Everything after this point
 * goes through mutators.
 */

const createBody = z.object({
	displayName: z.string().min(1).max(40),
	deviceId: z.string().min(1),
});

const joinBody = createBody.extend({
	code: z.string().min(4).max(12),
});

const JOINABLE = ["draft", "lobby", "running"] as const;

/** A default the host can change in M5, not a rule. */
const DEFAULT_HIDING_DURATION_MS = 30 * 60_000;

export const games = new Hono();

games.post("/", async (c) => {
	const parsed = createBody.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
	}
	const { displayName, deviceId } = parsed.data;

	const gameId = crypto.randomUUID();
	const playerId = crypto.randomUUID();
	const roundId = crypto.randomUUID();
	const now = Date.now();
	const map = starterMap();

	const created = await db.transaction(async (tx) => {
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
			displayName,
			deviceId,
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
			payload: { displayName },
		});
		await appendEvent(tx, {
			gameId,
			type: "round.created",
			actorPlayerId: playerId,
			payload: { roundId, ordinal: 1, roles: [] },
		});

		return { code, mapConfigId };
	});

	return c.json({
		gameId,
		code: created.code,
		mapConfigId: created.mapConfigId,
		playerId,
		token: await issueGameToken({ playerId, gameId, deviceId }),
	});
});

/**
 * What a code resolves to, before anybody types their name. m1-spec §8.
 *
 * The join screen asks this first so a wrong code says so while the keyboard is
 * still up, and a right one can announce what it found. Unauthenticated on
 * purpose — the code is the invitation — and it discloses nothing that is not
 * already being read aloud in the room the code came from.
 */
games.get("/:code", async (c) => {
	const code = c.req.param("code").toUpperCase();

	const [game] = await db
		.select()
		.from(drizzleSchema.game)
		.where(
			and(
				eq(drizzleSchema.game.code, code),
				inArray(drizzleSchema.game.status, [...JOINABLE]),
			),
		)
		.limit(1);

	// A game that has ended is not a different answer from one that never
	// existed: neither of them is a game this code can get you into.
	if (!game) return c.json({ error: "no_such_game" }, 404);

	const players = await db
		.select({
			displayName: drizzleSchema.player.displayName,
			isHost: drizzleSchema.player.isHost,
			leftAt: drizzleSchema.player.leftAt,
			removedByPlayerId: drizzleSchema.player.removedByPlayerId,
		})
		.from(drizzleSchema.player)
		.where(eq(drizzleSchema.player.gameId, game.id));

	const present = players.filter(
		(player) => player.leftAt === null && player.removedByPlayerId === null,
	);

	return c.json({
		code: game.code,
		status: game.status,
		playerCount: present.length,
		hostName: present.find((player) => player.isHost)?.displayName ?? null,
	});
});

games.post("/join", async (c) => {
	const parsed = joinBody.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
	}
	const { code, displayName, deviceId } = parsed.data;

	const result = await db.transaction(async (tx) => {
		const [game] = await tx
			.select()
			.from(drizzleSchema.game)
			.where(
				and(
					eq(drizzleSchema.game.code, code.toUpperCase()),
					inArray(drizzleSchema.game.status, [...JOINABLE]),
				),
			)
			.limit(1);

		if (!game) return null;

		/**
		 * A device that has been here before gets its player back rather than a
		 * second one. This is what makes acceptance test 2 work without host
		 * intervention: a force-quit phone rejoins and simply *is* who it was.
		 */
		const [existing] = await tx
			.select()
			.from(drizzleSchema.player)
			.where(
				and(
					eq(drizzleSchema.player.gameId, game.id),
					eq(drizzleSchema.player.deviceId, deviceId),
				),
			)
			.limit(1);

		if (existing) {
			/**
			 * Which of the two departures it was decides this, and it is the one
			 * thing about M1's kick that has to be settled rather than discovered.
			 * m1-spec §7.
			 *
			 * A kick a phone can undo by tapping "join" one second later is a button
			 * that lies, and a lying button is worse than no button. This is not
			 * enforcement: a removed player who genuinely wants back in can clear
			 * their device id and join under a new name, and that is fine. We are
			 * not defending against participants — we are making the host's action
			 * mean something to a cooperating device.
			 */
			if (existing.removedByPlayerId !== null) {
				return { removed: true } as const;
			}

			// Left voluntarily, or never left at all. People close apps by accident,
			// walk into tunnels and hand phones to friends: coming back is free.
			if (existing.leftAt !== null) {
				await tx
					.update(drizzleSchema.player)
					.set({ leftAt: null })
					.where(eq(drizzleSchema.player.id, existing.id));
				await appendEvent(tx, {
					gameId: game.id,
					type: "player.joined",
					actorPlayerId: existing.id,
					payload: { displayName: existing.displayName, rejoined: true },
				});
			}

			return { gameId: game.id, playerId: existing.id, rejoined: true };
		}

		const playerId = crypto.randomUUID();
		await tx.insert(drizzleSchema.player).values({
			id: playerId,
			gameId: game.id,
			displayName,
			deviceId,
			joinedAt: Date.now(),
			isHost: false,
			leftAt: null,
			removedByPlayerId: null,
		});
		await appendEvent(tx, {
			gameId: game.id,
			type: "player.joined",
			actorPlayerId: playerId,
			payload: { displayName },
		});

		return { gameId: game.id, playerId, rejoined: false };
	});

	if (!result) return c.json({ error: "no_such_game" }, 404);
	if ("removed" in result) return c.json({ error: "removed_from_game" }, 403);

	return c.json({
		gameId: result.gameId,
		playerId: result.playerId,
		rejoined: result.rejoined,
		code: code.toUpperCase(),
		token: await issueGameToken({
			playerId: result.playerId,
			gameId: result.gameId,
			deviceId,
		}),
	});
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function allocateCode(tx: Tx): Promise<string> {
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
