import { ApplicationError, type Transaction } from "@rocicorp/zero";
import type { GameContext, MutationRejection } from "../types";
import { zql } from "./schema";

/**
 * Who may do what. m1-spec §6.
 *
 * None of this is a security boundary — build plan, principle 2. It keeps a
 * stale client honest and it keeps two people setting up one lobby from working
 * at cross purposes. A rejection means somebody's screen was out of date, which
 * is the only case worth catching, and nothing here should be designed as
 * though a participant were an adversary.
 *
 * > **Host-only is exactly the set of actions that change the shape of the
 * > game** — how many teams there are, who is on which side, who is in the game
 * > at all. Everything about how you or your team present yourselves is yours.
 */

type Tx = Transaction;

export function requireContext(ctx: GameContext | undefined): GameContext {
	if (!ctx) {
		throw new ApplicationError("unauthenticated", {
			details: {
				code: "not_permitted",
				reason: "no game token",
			} satisfies MutationRejection,
		});
	}
	return ctx;
}

export function reject(rejection: MutationRejection): never {
	throw new ApplicationError(rejection.code, { details: rejection });
}

/**
 * A refusal the client is allowed to raise as well as the server.
 *
 * Optimistically it is the point: a write a stale screen should never have made
 * does not flash up and disappear. During a **rebase** it is not — by then the
 * server has already had its say, and throwing fails the whole poke and takes
 * the connection down with it. m0-spec §7 learned that with `question.answer`.
 */
export function refuse(tx: Tx, rejection: MutationRejection): void {
	if (tx.location === "client" && tx.reason === "rebase") return;
	reject(rejection);
}

export async function requireHost(
	tx: Tx,
	playerId: string,
	action: string,
): Promise<void> {
	const player = await tx.run(zql.player.where("id", playerId).one());
	if (!player) {
		// A client that has not synced the row cannot decide this, and guessing
		// would refuse legitimate writes on a cold start. The server can decide,
		// and there a missing player is a genuine refusal.
		if (tx.location === "server") {
			reject({ code: "not_permitted", reason: `${action} is for the host` });
		}
		return;
	}
	if (!player.isHost) {
		refuse(tx, { code: "not_permitted", reason: `${action} is for the host` });
	}
}

/** How a team presents itself belongs to that team, not to the host. m1-spec §4. */
export async function requireTeamMember(
	tx: Tx,
	playerId: string,
	teamId: string,
	action: string,
): Promise<void> {
	const membership = await tx.run(
		zql.teamMember.where("teamId", teamId).where("playerId", playerId).one(),
	);
	if (membership) return;

	// An absent membership row means "not a member" — unless the client has not
	// synced the team either, in which case it means nothing. `queries.teams()`
	// carries members alongside the team, so knowing the team *is* knowing
	// whether you are in it.
	if (tx.location !== "server") {
		const team = await tx.run(zql.team.where("id", teamId).one());
		if (!team) return;
	}

	refuse(tx, {
		code: "not_permitted",
		reason: `${action} is for that team's own members`,
	});
}
