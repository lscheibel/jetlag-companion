import { buildMap, type MapDraft } from "@zero-lag/catalog";
import { SCALE_PRESETS } from "@zero-lag/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { contextFromRequest } from "../auth";
import { loadCatalog } from "../catalog";
import { db, drizzleSchema } from "../db";
import { appendEvent, generateJoinCode } from "../game-log";
import { mapEventPayload, writeMapConfig } from "../map";

/**
 * Templates and applying them, over plain HTTP rather than Zero. m4-spec §7.
 *
 * Zero's query context is a game and a template belongs to no game — that is
 * the entire point of one. m0-spec already carries the precedent: joining is
 * HTTP because a token has to exist before Zero can be pointed at anything, and
 * a template has to be readable before a game exists to point at.
 */

const position = z.tuple([z.number(), z.number()]);

const draftBody = z.object({
	name: z.string().min(1).max(80),
	scalePreset: z.enum(SCALE_PRESETS),
	/** The ring the host drew, open or closed. */
	ring: z.array(position).min(3),
	hidingRadiusMeters: z.number().positive().max(50_000).optional(),
});

export const maps = new Hono();

/**
 * Saving writes a row and never updates one, so a code you gave somebody cannot
 * change under them. Renaming or editing produces a new row with a new code —
 * which is why "duplicate" is not a feature but a consequence.
 */
maps.post("/", async (c) => {
	const ctx = await contextFromRequest(c.req.raw);
	if (!ctx) return c.json({ error: "unauthenticated" }, 401);

	const parsed = draftBody.safeParse(await c.req.json());
	if (!parsed.success) {
		return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
	}

	const map = buildMap(toDraft(parsed.data), loadCatalog());
	if (map.validHidingArea.length === 0) {
		return c.json({ error: "empty_area" }, 400);
	}

	const id = crypto.randomUUID();
	const code = await db.transaction(async (tx) => {
		const code = await allocateTemplateCode(tx);
		await tx.insert(drizzleSchema.mapTemplate).values({
			id,
			code,
			name: map.name,
			createdByPlayerId: ctx.playerId,
			createdAt: Date.now(),
			catalogVersion: map.catalogVersion,
			scalePreset: map.scalePreset,
			selection: map.selection,
			hidingRadiusMeters: map.hidingRadiusMeters,
			validHidingArea: map.validHidingArea,
			contentHash: map.contentHash,
		});
		return code;
	});

	return c.json({ id, code, contentHash: map.contentHash });
});

/** Public: a share code is a link somebody sends to a friend. */
maps.get("/:code", async (c) => {
	const [template] = await db
		.select()
		.from(drizzleSchema.mapTemplate)
		.where(
			eq(drizzleSchema.mapTemplate.code, c.req.param("code").toUpperCase()),
		)
		.limit(1);

	if (!template) return c.json({ error: "no_such_map" }, 404);
	return c.json({
		id: template.id,
		code: template.code,
		name: template.name,
		scalePreset: template.scalePreset,
		selection: template.selection,
		hidingRadiusMeters: template.hidingRadiusMeters,
		validHidingArea: template.validHidingArea,
		catalogVersion: template.catalogVersion,
		contentHash: template.contentHash,
	});
});

export const gameMaps = new Hono();

/**
 * Applying a map: the config row, its stops and the event in one transaction on
 * the game database, exactly as `POST /games` already does. The catalog read
 * happens before it opens, which is safe because the catalog is static.
 *
 * Two hosts applying is last-write-wins rather than first-to-the-server-wins.
 * Configuring the board is not an action a team may take only once: a host who
 * applies a map after another host did has changed their mind, and the correct
 * behaviour is that the map changes. m4-spec §7.
 */
gameMaps.post("/:gameId/map", async (c) => {
	const ctx = await contextFromRequest(c.req.raw);
	if (!ctx) return c.json({ error: "unauthenticated" }, 401);

	const gameId = c.req.param("gameId");
	if (ctx.gameId !== gameId) return c.json({ error: "not_permitted" }, 403);

	const body = await c.req.json();
	const fromTemplate = z
		.object({ templateCode: z.string().min(4).max(12) })
		.safeParse(body);
	const fromDraft = draftBody.safeParse(body);
	if (!fromTemplate.success && !fromDraft.success) {
		return c.json({ error: "invalid_body" }, 400);
	}

	const catalog = loadCatalog();
	let draft: MapDraft;
	let templateId: string | null = null;
	let pinnedVersion: string | null = null;

	if (fromTemplate.success) {
		const [template] = await db
			.select()
			.from(drizzleSchema.mapTemplate)
			.where(
				eq(
					drizzleSchema.mapTemplate.code,
					fromTemplate.data.templateCode.toUpperCase(),
				),
			)
			.limit(1);
		if (!template) return c.json({ error: "no_such_map" }, 404);
		templateId = template.id;
		pinnedVersion = template.catalogVersion;
		draft = {
			name: template.name,
			scalePreset: template.scalePreset,
			selection: template.selection,
			hidingRadiusMeters: template.hidingRadiusMeters,
		};
	} else if (fromDraft.success) {
		draft = toDraft(fromDraft.data);
	} else {
		return c.json({ error: "invalid_body" }, 400);
	}

	const map = buildMap(draft, catalog);
	if (map.validHidingArea.length === 0) {
		return c.json({ error: "empty_area" }, 400);
	}

	const applied = await db.transaction(async (tx) => {
		const [game] = await tx
			.select()
			.from(drizzleSchema.game)
			.where(eq(drizzleSchema.game.id, gameId))
			.limit(1);
		if (!game) return null;

		const supersedesConfigId = game.mapConfigId;
		const mapConfigId = await writeMapConfig(tx, {
			gameId,
			map,
			sourceTemplateId: templateId,
			supersedesConfigId,
		});
		await tx
			.update(drizzleSchema.game)
			.set({ mapConfigId })
			.where(eq(drizzleSchema.game.id, gameId));

		await appendEvent(tx, {
			gameId,
			type: supersedesConfigId ? "map.changed" : "map.applied",
			actorPlayerId: ctx.playerId,
			// Configuring the board is not a team act. m4-spec §10.
			actorTeamId: null,
			payload: {
				...mapEventPayload(mapConfigId, map),
				templateId,
				supersedesConfigId,
			},
		});

		return mapConfigId;
	});

	if (!applied) return c.json({ error: "no_such_game" }, 404);

	/**
	 * A template whose pinned version has been superseded falls back to the
	 * current one and *says so* rather than failing: the feed's stop ids can move
	 * between builds, and the honest behaviour is to rebuild the index and name
	 * the version used. The polygon — the actual board — is unaffected either
	 * way, which is why this degrades gracefully. m4-spec §7.
	 */
	return c.json({
		mapConfigId: applied,
		contentHash: map.contentHash,
		stopCount: map.stops.length,
		catalogVersion: map.catalogVersion,
		catalogVersionChanged:
			pinnedVersion !== null && pinnedVersion !== catalog.version,
	});
});

function toDraft(input: z.infer<typeof draftBody>): MapDraft {
	return {
		name: input.name,
		scalePreset: input.scalePreset,
		selection: { kind: "drawn", polygon: [[input.ring]] },
		hidingRadiusMeters: input.hidingRadiusMeters,
	};
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function allocateTemplateCode(tx: Tx): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const code = generateJoinCode();
		const [taken] = await tx
			.select({ id: drizzleSchema.mapTemplate.id })
			.from(drizzleSchema.mapTemplate)
			.where(eq(drizzleSchema.mapTemplate.code, code))
			.limit(1);
		if (!taken) return code;
	}
	throw new Error("could not allocate a unique map code");
}
