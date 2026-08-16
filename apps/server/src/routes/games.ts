import { berlinFixtureMapConfig } from "@zero-lag/area-packs";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { issueGameToken } from "../auth";
import { db, drizzleSchema } from "../db";
import { appendEvent, generateJoinCode } from "../game-log";

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

export const games = new Hono();

games.post("/", async (c) => {
	const parsed = createBody.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
	}
	const { displayName, deviceId } = parsed.data;

	const gameId = crypto.randomUUID();
	const playerId = crypto.randomUUID();
	const now = Date.now();
	const mapConfig = berlinFixtureMapConfig(gameId);

	const code = await db.transaction(async (tx) => {
		const code = await allocateCode(tx);

		await tx.insert(drizzleSchema.game).values({
			id: gameId,
			code,
			status: "lobby",
			hostPlayerId: playerId,
			mapConfigId: mapConfig.id,
			eventSeq: 0,
			positionIntervalMs: 30_000,
			createdAt: now,
			startedAt: null,
			endedAt: null,
		});

		// M0 hand-writes one map config as a fixture; M4 generates them.
		await tx.insert(drizzleSchema.mapConfig).values({
			id: mapConfig.id,
			gameId,
			areaPackId: mapConfig.areaPackId,
			areaPackVersion: mapConfig.areaPackVersion,
			projection: mapConfig.projection,
			validHidingArea: mapConfig.validHidingArea,
			enabledStopIds: [...mapConfig.enabledStopIds],
			hidingRadiusByMode: mapConfig.hidingRadiusByMode,
			contentHash: mapConfig.contentHash,
		});

		await tx.insert(drizzleSchema.player).values({
			id: playerId,
			gameId,
			displayName,
			deviceId,
			joinedAt: now,
		});

		await appendEvent(tx, {
			gameId,
			type: "game.created",
			actorPlayerId: playerId,
			payload: { code, mapConfigId: mapConfig.id },
		});
		await appendEvent(tx, {
			gameId,
			type: "player.joined",
			actorPlayerId: playerId,
			payload: { displayName },
		});

		return code;
	});

	return c.json({
		gameId,
		code,
		playerId,
		token: await issueGameToken({ playerId, gameId, deviceId }),
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
			return { gameId: game.id, playerId: existing.id, rejoined: true };
		}

		const playerId = crypto.randomUUID();
		await tx.insert(drizzleSchema.player).values({
			id: playerId,
			gameId: game.id,
			displayName,
			deviceId,
			joinedAt: Date.now(),
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
