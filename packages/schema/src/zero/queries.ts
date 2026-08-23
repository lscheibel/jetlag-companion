import { defineQueries, defineQuery } from "@rocicorp/zero";
import type { GameContext } from "../types";
import { zql } from "./schema";

/**
 * Clients cannot send ZQL to `zero-cache`. They invoke a query by name, and
 * `zero-cache` asks this server what that name means. m0-spec §3.
 *
 * That makes this file the read half of the visibility rule in §8. The filter
 * lives here rather than in a component for the same reason it lives on the
 * server for presence: the alternative — sending everything and hiding it in
 * the client — makes an accidental leak a one-line UI mistake instead of an
 * impossible one.
 */

function requireContext(ctx: GameContext | undefined): GameContext {
	if (!ctx) {
		throw new Error("Zero query invoked without an authenticated context");
	}
	return ctx;
}

export const queries = defineQueries({
	game: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return zql.game.where("id", gameId).related("mapConfig");
	}),

	/**
	 * The board everybody plays on, so no visibility filter: there has never
	 * been a version of this feature where one team sees a different board than
	 * another. Scoped to the config currently in force rather than every config
	 * the game has ever had. m4-spec §2.
	 */
	mapStops: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return zql.mapStop.where(({ exists }) =>
			exists("currentGame", (game) => game.where("id", gameId)),
		);
	}),

	players: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return zql.player.where("gameId", gameId);
	}),

	teams: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return (
			zql.team
				.where("gameId", gameId)
				.related("members", (member) => member.related("player"))
				// Deterministic on every device, which is what M0 wanted from ordering
				// by name — and stable under a rename, which is what M0 did not get.
				// A team editing its own name should not shuffle the lobby under
				// somebody's thumb. m1-spec §2.
				.orderBy("createdAt", "asc")
		);
	}),

	rounds: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return zql.round
			.where("gameId", gameId)
			.related("roles")
			.orderBy("ordinal", "asc");
	}),

	/**
	 * A question is visible to the team that asked it and the team it was asked
	 * of, and to nobody else — seeker teams play against each other and do not
	 * share deductions.
	 */
	questions: defineQuery(({ ctx }) => {
		const { gameId, playerId } = requireContext(ctx);
		return zql.question
			.where(({ exists, or, and }) =>
				and(
					exists("round", (round) => round.where("gameId", gameId)),
					or(
						exists("askingTeamMembers", (member) =>
							member.where("playerId", playerId),
						),
						exists("targetTeamMembers", (member) =>
							member.where("playerId", playerId),
						),
					),
				),
			)
			.related("answers")
			.orderBy("askedAt", "asc");
	}),

	/** Scoped to one (seeker team, hider team) pair, and readable by that seeker team. */
	constraints: defineQuery(({ ctx }) => {
		const { playerId } = requireContext(ctx);
		return zql.constraint
			.where(({ exists }) =>
				exists("seekerTeamMembers", (member) =>
					member.where("playerId", playerId),
				),
			)
			.orderBy("ordinal", "asc");
	}),

	/** Team-authored content is visible to that team only, with no role exception. */
	pins: defineQuery(({ ctx }) => {
		const { gameId, playerId } = requireContext(ctx);
		return zql.pin
			.where("gameId", gameId)
			.where(({ exists }) =>
				exists("teamMembers", (member) => member.where("playerId", playerId)),
			)
			.orderBy("createdAt", "asc");
	}),

	/** A team's intended search area is private authored content. m3-spec §3. */
	searchZones: defineQuery(({ ctx }) => {
		const { gameId, playerId } = requireContext(ctx);
		return zql.searchZone.where(({ and, exists }) =>
			and(
				exists("round", (round) => round.where("gameId", gameId)),
				exists("seekerTeamMembers", (member) =>
					member.where("playerId", playerId),
				),
			),
		);
	}),

	/**
	 * A committed zone is the hiders' secret while the round runs. It becomes
	 * everyone's once the round is over, which is when a replay wants it.
	 */
	commitments: defineQuery(({ ctx }) => {
		const { playerId } = requireContext(ctx);
		return zql.hidingCommitment.where(({ exists, or }) =>
			or(
				exists("hiderTeamMembers", (member) =>
					member.where("playerId", playerId),
				),
				exists("round", (round) => round.where("status", "ended")),
			),
		);
	}),

	/**
	 * M0 syncs a player only their own team's track.
	 *
	 * §8 gives hiders a wider view of *live* presence, and that is delivered on
	 * the ephemeral channel where it is specified. Widening the durable log to
	 * match is M14's business, when replay actually needs it; until then the
	 * strict filter is the one that cannot leak by accident.
	 */
	positionLog: defineQuery(({ ctx }) => {
		const { gameId, playerId } = requireContext(ctx);
		return zql.positionSnapshot
			.where("gameId", gameId)
			.where(({ exists }) =>
				exists("teamMembers", (member) => member.where("playerId", playerId)),
			)
			.orderBy("capturedAt", "asc");
	}),

	/** Ordering is always `seq`, never a clock. m0-spec §6. */
	events: defineQuery(({ ctx }) => {
		const { gameId } = requireContext(ctx);
		return zql.event.where("gameId", gameId).orderBy("seq", "asc");
	}),
});
