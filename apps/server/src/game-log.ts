import type { EventType, Json } from "@zero-lag/schema";
import { eq, sql } from "drizzle-orm";
import { drizzleSchema } from "./db";

type DrizzleTx = Parameters<
	Parameters<typeof import("./db").db.transaction>[0]
>[0];

/**
 * The plain-HTTP half of m0-spec §6.
 *
 * Game creation and joining happen before a token exists, so they cannot go
 * through a Zero mutator — but the rule that every state write is accompanied
 * by an event row in the same transaction has no exceptions, this path
 * included.
 */
export async function appendEvent(
	tx: DrizzleTx,
	entry: {
		gameId: string;
		type: EventType;
		actorPlayerId: string | null;
		actorTeamId?: string | null;
		payload: Json;
	},
): Promise<number> {
	const [updated] = await tx
		.update(drizzleSchema.game)
		.set({ eventSeq: sql`${drizzleSchema.game.eventSeq} + 1` })
		.where(eq(drizzleSchema.game.id, entry.gameId))
		.returning({ seq: drizzleSchema.game.eventSeq });

	if (!updated) {
		throw new Error(`cannot append an event to unknown game ${entry.gameId}`);
	}

	await tx.insert(drizzleSchema.event).values({
		id: crypto.randomUUID(),
		gameId: entry.gameId,
		seq: updated.seq,
		type: entry.type,
		version: 1,
		actorPlayerId: entry.actorPlayerId,
		actorTeamId: entry.actorTeamId ?? null,
		payload: entry.payload,
		clientSubmittedAt: null,
		serverReceivedAt: Date.now(),
	});

	return updated.seq;
}

/**
 * Six characters, no `0/O` and no `1/I`. Globally unique, which is the simplest
 * thing to reason about and nowhere near a problem at this scale. m0-spec §13.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	let code = "";
	for (const byte of bytes) {
		code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
	}
	return code;
}
