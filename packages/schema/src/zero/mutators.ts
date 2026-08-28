import {
	defineMutator,
	defineMutators,
	type Transaction,
} from "@rocicorp/zero";
import { answerToConstraintGeometry, elapsed } from "@zero-lag/rules";
import { z } from "zod";
import type {
	EventType,
	GameContext,
	Json,
	RoundStatus,
	TeamRole,
} from "../types";
import { constraintGeometry } from "./constraint-geometry";
import {
	refuse,
	reject,
	requireContext,
	requireHost,
	requireTeamEditor,
	requireTeamMember,
} from "./guards";
import { zql } from "./schema";

/**
 * Every mutator writes the state rows the UI queries **and** an event row, in
 * one transaction. There is no exception to this, and a state write with no
 * event is a defect. m0-spec §6.
 */

/**
 * A mutator runs twice on the client and once on the server, so this returns
 * three different numbers for one logical mutation. That is fine everywhere it
 * is used: the server's value is the authoritative one and replaces the
 * optimistic guess, and every field written from it is defined as "the server's
 * clock" in §7.
 */
function now(): number {
	return Date.now();
}

const positionSource = z.enum(["gps", "network", "manual", "unavailable"]);

const clientFix = z.object({
	lng: z.number(),
	lat: z.number(),
	accuracyMeters: z.number(),
	headingDeg: z.number().nullable(),
	speedMps: z.number().nullable(),
	capturedAt: z.number(),
	source: positionSource,
});

const positionSnapshot = clientFix.extend({
	receivedAt: z.number().nullable(),
});

const answerValue = z.object({
	kind: z.literal("boolean"),
	value: z.boolean(),
});

const withEvent = { eventId: z.string() };
const lngLat = z.tuple([z.number(), z.number()]);
const multiPolygon = z.array(z.array(z.array(lngLat)));
const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const radiusMeters = z.number().finite().positive();

type Tx = Transaction;

type EventEntry = {
	eventId: string;
	type: EventType;
	actorPlayerId: string | null;
	actorTeamId: string | null;
	payload: Json;
	clientSubmittedAt?: number | null;
};

/**
 * One transaction, several events, consecutive `seq`. A team move is genuinely
 * two things that happened — a leave and a join — and the log says so.
 *
 * The counter is read once and written once rather than per event, so this does
 * not depend on a mutator seeing its own uncommitted writes. That holds inside a
 * Postgres transaction on the server; assuming it of the client's store as well
 * would be the kind of correlation that stops being true quietly.
 */
async function appendEvents(
	tx: Tx,
	gameId: string,
	entries: readonly EventEntry[],
): Promise<void> {
	if (entries.length === 0) return;

	const game = await tx.run(zql.game.where("id", gameId).one());
	if (!game) {
		reject({
			code: "game_state_invalid",
			expected: "an existing game",
			actual: "no such game",
		});
	}

	// Allocated inside the mutator transaction from a per-game counter, so
	// replay ordering is total and gap-free.
	let seq = game.eventSeq;
	for (const entry of entries) {
		seq += 1;
		await tx.mutate.event.insert({
			id: entry.eventId,
			gameId,
			seq,
			type: entry.type,
			version: 1,
			actorPlayerId: entry.actorPlayerId,
			actorTeamId: entry.actorTeamId,
			payload: entry.payload,
			clientSubmittedAt: entry.clientSubmittedAt ?? null,
			serverReceivedAt: now(),
		});
	}
	await tx.mutate.game.update({ id: gameId, eventSeq: seq });
}

async function appendEvent(
	tx: Tx,
	entry: EventEntry & { gameId: string },
): Promise<void> {
	const { gameId, ...rest } = entry;
	await appendEvents(tx, gameId, [rest]);
}

/**
 * A second event in one mutation needs a second id, and it has to be the same
 * id on the client's optimistic pass and on the server's authoritative one. The
 * client sends one `eventId`; the rest are derived from it, which is
 * deterministic without a second round of randomness in the arguments.
 */
function derivedEventId(eventId: string, suffix: string): string {
	return `${eventId}:${suffix}`;
}

/** Postgres unique-violation, wherever it is buried in the driver's error chain. */
function isDuplicateAnswer(error: unknown): boolean {
	let current: unknown = error;
	for (
		let depth = 0;
		depth < 5 && current !== null && current !== undefined;
		depth++
	) {
		if (typeof current === "object") {
			const candidate = current as {
				code?: unknown;
				message?: unknown;
				cause?: unknown;
			};
			if (candidate.code === "23505") return true;
			if (
				typeof candidate.message === "string" &&
				candidate.message.includes("answer_question_idx")
			) {
				return true;
			}
			current = candidate.cause;
			continue;
		}
		break;
	}
	return false;
}

export const mutators = defineMutators({
	/**
	 * The host hat. Self-scoped and gated by nothing at all: two people setting
	 * up a lobby together is a normal Tuesday, not a conflict, so more than one
	 * player may wear it and there is no transfer, no hand-off and no approval
	 * step. A game can also end up with none, which the lobby heals by asking.
	 * m1-spec §6.
	 */
	game: {
		claimHost: defineMutator(
			z.object({ ...withEvent }),
			async ({ tx, ctx, args }) => {
				await setHost(tx, requireContext(ctx), args.eventId, true);
			},
		),

		releaseHost: defineMutator(
			z.object({ ...withEvent }),
			async ({ tx, ctx, args }) => {
				await setHost(tx, requireContext(ctx), args.eventId, false);
			},
		),
	},

	rules: {
		update: defineMutator(
			z.object({
				...withEvent,
				text: z.string().max(50_000),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "updating house rules");

				const updatedAt = now();
				await tx.mutate.houseRules.upsert({
					gameId,
					text: args.text,
					updatedAt,
					updatedByPlayerId: playerId,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "rules.updated",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { length: args.text.length },
				});
			},
		),
	},

	player: {
		/**
		 * `playerId` names somebody else, and only a host may do that. One mutator
		 * per concept rather than a `renameOther` twin of everything.
		 */
		rename: defineMutator(
			z.object({
				...withEvent,
				playerId: z.string().optional(),
				displayName: z.string().min(1).max(40),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const target = args.playerId ?? playerId;
				if (target !== playerId) {
					await requireHost(tx, playerId, "renaming another player");
				}

				await tx.mutate.player.update({
					id: target,
					displayName: args.displayName,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "player.renamed",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload:
						target === playerId
							? { displayName: args.displayName }
							: { displayName: args.displayName, playerId: target },
				});
			},
		),

		/**
		 * Ready, in the player's own words — or a host ticking it for someone
		 * who is already on a platform and just has not pressed the button.
		 * `playerId` names somebody else, and only a host may do that. Reversible,
		 * because people say yes and then get on the wrong train.
		 */
		setReady: defineMutator(
			z.object({
				...withEvent,
				ready: z.boolean(),
				playerId: z.string().optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const target = args.playerId ?? playerId;
				if (target !== playerId) {
					await requireHost(tx, playerId, "marking another player ready");
				}

				await tx.mutate.player.update({
					id: target,
					readyAt: args.ready ? now() : null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "player.readyChanged",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload:
						target === playerId
							? { ready: args.ready }
							: { ready: args.ready, playerId: target },
				});
			},
		),

		/**
		 * Leaving is a column, never a delete: `event.actorPlayerId`,
		 * `answer.answeringPlayerId` and `positionSnapshot.playerId` all point at
		 * this row, and M14 replays a game with names attached. m1-spec §7.
		 *
		 * `removedByPlayerId` stays null, and that is the whole difference between
		 * this and `remove`: the join endpoint reads it to decide whether coming
		 * back is frictionless or refused.
		 */
		leave: defineMutator(
			z.object({ ...withEvent }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await dropMemberships(tx, playerId);
				await tx.mutate.player.update({
					id: playerId,
					leftAt: now(),
					removedByPlayerId: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "player.left",
					actorPlayerId: playerId,
					actorTeamId: null,
					// The membership goes in this same transaction; a player who has
					// left is on no team, and the log does not need to say it twice.
					payload: {},
				});
			},
		),

		remove: defineMutator(
			z.object({ ...withEvent, playerId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "removing a player");

				await dropMemberships(tx, args.playerId);
				await tx.mutate.player.update({
					id: args.playerId,
					leftAt: now(),
					removedByPlayerId: playerId,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "player.removed",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { playerId: args.playerId },
				});
			},
		),

		readmit: defineMutator(
			z.object({ ...withEvent, playerId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "re-admitting a player");

				const target = await tx.run(
					zql.player.where("id", args.playerId).one(),
				);
				await tx.mutate.player.update({
					id: args.playerId,
					leftAt: null,
					removedByPlayerId: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					// `player.joined` means "this player is in the game now", so the
					// actor is them rather than the host — who is named in the payload
					// so the log does not lose whose decision it was.
					type: "player.joined",
					actorPlayerId: args.playerId,
					actorTeamId: null,
					payload: {
						displayName: target?.displayName ?? "",
						readmitted: true,
						readmittedByPlayerId: playerId,
					},
				});
			},
		),
	},

	team: {
		/**
		 * Host only: how many teams there are is a property of the game rather than
		 * of anyone's presentation, and it is exactly the sort of thing a player
		 * new to the game should not be able to change by accident. m1-spec §4.
		 */
		create: defineMutator(
			z.object({
				...withEvent,
				teamId: z.string(),
				name: z.string().min(1).max(40),
				color: z.string(),
				emoji: z.string(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "creating a team");

				await tx.mutate.team.insert({
					id: args.teamId,
					gameId,
					name: args.name,
					color: args.color,
					emoji: args.emoji,
					createdAt: now(),
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "team.created",
					actorPlayerId: playerId,
					actorTeamId: args.teamId,
					payload: { name: args.name, color: args.color, emoji: args.emoji },
				});
			},
		),

		/**
		 * A team's own members, not the host — unless nobody is on it yet, in
		 * which case the host who is still composing the game may finish the
		 * name, colour and face. Duplicate colours are prevented by the picker
		 * and not here: a duplicate is ugly rather than broken. m1-spec §4.
		 */
		update: defineMutator(
			z.object({
				...withEvent,
				teamId: z.string(),
				name: z.string().min(1).max(40).optional(),
				color: z.string().optional(),
				emoji: z.string().optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireTeamEditor(tx, playerId, args.teamId, "editing a team");

				const changes: { name?: string; color?: string; emoji?: string } = {};
				if (args.name !== undefined) changes.name = args.name;
				if (args.color !== undefined) changes.color = args.color;
				if (args.emoji !== undefined) changes.emoji = args.emoji;
				if (Object.keys(changes).length === 0) return;

				await tx.mutate.team.update({ id: args.teamId, ...changes });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "team.updated",
					actorPlayerId: playerId,
					actorTeamId: args.teamId,
					// Changed fields only — a replay reader wants the diff, and a
					// full snapshot here would make an unchanged emoji look edited.
					payload: changes,
				});
			},
		),

		/**
		 * Lobby only. `question`, `constraint`, `hidingCommitment` and
		 * `positionSnapshot` all carry a `teamId`, and the event log names teams
		 * that must still resolve — so once a round has left `pending` there is no
		 * safe version of this. Inside the lobby the whole thing is one
		 * transaction: every member moves out, the pending round's role row goes,
		 * then the team. m1-spec §4.
		 */
		delete: defineMutator(
			z.object({ ...withEvent, teamId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "deleting a team");

				const rounds = await tx.run(zql.round.where("gameId", gameId));
				const started = rounds.find((round) => round.status !== "pending");
				if (started) {
					reject({
						code: "game_state_invalid",
						expected: "a lobby, where no round has started",
						actual: `round ${started.ordinal} is ${started.status}`,
					});
				}

				const team = await tx.run(zql.team.where("id", args.teamId).one());
				const members = await tx.run(
					zql.teamMember.where("teamId", args.teamId),
				);

				const events: EventEntry[] = [];
				for (const member of members) {
					await tx.mutate.teamMember.delete({
						teamId: args.teamId,
						playerId: member.playerId,
					});
					events.push({
						eventId: derivedEventId(args.eventId, `left:${member.playerId}`),
						type: "team.memberLeft",
						actorPlayerId: member.playerId,
						actorTeamId: args.teamId,
						payload: {},
					});
				}

				for (const round of rounds) {
					await tx.mutate.roundTeamRole.delete({
						roundId: round.id,
						teamId: args.teamId,
					});
				}

				await tx.mutate.team.delete({ id: args.teamId });
				events.push({
					eventId: args.eventId,
					type: "team.deleted",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { teamId: args.teamId, name: team?.name ?? "" },
				});

				await appendEvents(tx, gameId, events);
			},
		),

		/**
		 * **Joining is a move.** M0 upserted the membership and left the old one
		 * standing, so a player who joined a second team was in both and
		 * `useMyRole` silently picked whichever sorted first — a seeker on one
		 * device and a hider on another, which reads as a sync bug for as long as
		 * it takes somebody to look at the table. m1-spec §5.
		 *
		 * Delete before insert, in this transaction, or the UNIQUE index on
		 * `teamMember.playerId` rejects the move it exists to protect.
		 */
		join: defineMutator(
			z.object({
				...withEvent,
				teamId: z.string(),
				playerId: z.string().optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const target = args.playerId ?? playerId;
				if (target !== playerId) {
					await requireHost(tx, playerId, "moving another player");
				}

				const events: EventEntry[] = [];
				for (const membership of await tx.run(
					zql.teamMember.where("playerId", target),
				)) {
					// Already there. Nothing happened twice.
					if (membership.teamId === args.teamId) return;
					await tx.mutate.teamMember.delete({
						teamId: membership.teamId,
						playerId: target,
					});
					events.push({
						eventId: derivedEventId(args.eventId, "left"),
						type: "team.memberLeft",
						actorPlayerId: target,
						actorTeamId: membership.teamId,
						payload: {},
					});
				}

				await tx.mutate.teamMember.insert({
					teamId: args.teamId,
					playerId: target,
					joinedAt: now(),
				});
				events.push({
					eventId: args.eventId,
					type: "team.memberJoined",
					actorPlayerId: target,
					actorTeamId: args.teamId,
					payload: {},
				});

				await appendEvents(tx, gameId, events);
			},
		),

		leave: defineMutator(
			z.object({ ...withEvent, teamId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.teamMember.delete({ teamId: args.teamId, playerId });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "team.memberLeft",
					actorPlayerId: playerId,
					actorTeamId: args.teamId,
					payload: {},
				});
			},
		),
	},

	round: {
		/**
		 * The lobby's role assignment and M5's between-round swap are the same
		 * write: round 1 exists from game creation with `status: "pending"`, so
		 * there is always somewhere to assign into and a team never needs a role
		 * column. m1-spec §3.
		 *
		 * The event carries the complete assignment rather than a delta, so a
		 * replay reader never has to accumulate to know the state of the board.
		 */
		assignRoles: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				roles: z.array(
					z.object({
						teamId: z.string(),
						role: z.enum(["seeker", "hider"]),
					}),
				),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "assigning roles");

				const assigned = new Set(args.roles.map((role) => role.teamId));
				for (const existing of await tx.run(
					zql.roundTeamRole.where("roundId", args.roundId),
				)) {
					if (assigned.has(existing.teamId)) continue;
					await tx.mutate.roundTeamRole.delete({
						roundId: args.roundId,
						teamId: existing.teamId,
					});
				}
				for (const role of args.roles) {
					await tx.mutate.roundTeamRole.upsert({
						roundId: args.roundId,
						teamId: role.teamId,
						role: role.role,
					});
				}

				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.rolesAssigned",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { roundId: args.roundId, roles: args.roles },
				});
			},
		),

		/**
		 * A round is the unit of play, and role is assigned here rather than on the
		 * team, because hiders and seekers swap between rounds. m0-spec §5.
		 */
		create: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				ordinal: z.number().int().positive(),
				hidingDurationMs: z.number().int().positive(),
				roles: z
					.array(
						z.object({
							teamId: z.string(),
							role: z.enum(["seeker", "hider"]),
						}),
					)
					.min(2),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "creating a round");
				await tx.mutate.round.insert({
					id: args.roundId,
					gameId,
					ordinal: args.ordinal,
					status: "pending",
					hidingDurationMs: args.hidingDurationMs,
					hidingStartedAt: null,
					seekingStartedAt: null,
					endedAt: null,
				});
				for (const role of args.roles) {
					await tx.mutate.roundTeamRole.insert({
						roundId: args.roundId,
						teamId: role.teamId,
						role: role.role,
					});
				}
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.created",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: {
						roundId: args.roundId,
						ordinal: args.ordinal,
						roles: args.roles,
					},
				});
			},
		),

		/**
		 * How long the hiders get, set before the whistle rather than at it.
		 *
		 * `startHiding` can carry a duration of its own, but a number that only
		 * exists at the moment of starting is a number nobody can read in the
		 * briefing beforehand — and the briefing is what a player says they are
		 * ready for. Pending rounds only: the clock a round is already running on
		 * is not a setting.
		 */
		setHidingDuration: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				hidingDurationMs: z.number().int().positive(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "setting the hiding time");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"setting the hiding time",
				);
				if (
					!round ||
					!requireRoundPhase(
						tx,
						round.status,
						"pending",
						"setting the hiding time",
					)
				) {
					return;
				}

				await tx.mutate.round.update({
					id: args.roundId,
					hidingDurationMs: args.hidingDurationMs,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.hidingDurationSet",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: {
						roundId: args.roundId,
						hidingDurationMs: args.hidingDurationMs,
					},
				});
			},
		),

		startHiding: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				hidingDurationMs: z.number().int().positive().optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "starting the hiding phase");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"starting the hiding phase",
				);
				if (
					!round ||
					!requireRoundPhase(tx, round.status, "pending", "starting hiding")
				) {
					return;
				}

				const startedAt = now();
				const hidingDurationMs =
					args.hidingDurationMs ?? round.hidingDurationMs;
				await tx.mutate.round.update({
					id: args.roundId,
					status: "hiding",
					hidingDurationMs,
					hidingStartedAt: startedAt,
				});
				await tx.mutate.game.update({ id: gameId, status: "running" });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.hidingStarted",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { roundId: args.roundId, startedAt, hidingDurationMs },
				});
			},
		),

		startSeeking: defineMutator(
			z.object({ ...withEvent, roundId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "starting the seeking phase");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"starting the seeking phase",
				);
				if (
					!round ||
					!requireRoundPhase(tx, round.status, "hiding", "starting seeking") ||
					!(await requireNoOpenPause(tx, args.roundId, "starting seeking"))
				) {
					return;
				}

				const startedAt = now();
				await tx.mutate.round.update({
					id: args.roundId,
					status: "seeking",
					seekingStartedAt: startedAt,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.seekingStarted",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { roundId: args.roundId, startedAt },
				});
			},
		),

		end: defineMutator(
			z.object({ ...withEvent, roundId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "ending a round");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"ending a round",
				);
				if (
					!round ||
					!requireRoundPhase(tx, round.status, "seeking", "ending a round") ||
					!(await requireNoOpenPause(tx, args.roundId, "ending a round"))
				) {
					return;
				}

				const endedAt = now();
				const roles = await tx.run(
					zql.roundTeamRole.where("roundId", args.roundId),
				);
				for (const role of roles) {
					if (role.role !== "hider") continue;
					const existing = await findOutcome(tx, args.roundId, role.teamId);
					if (existing) continue;
					await tx.mutate.hiderOutcome.insert({
						id: outcomeId(args.roundId, role.teamId),
						roundId: args.roundId,
						hiderTeamId: role.teamId,
						seekerTeamId: null,
						foundAt: null,
						durationMillis: null,
						photoId: null,
						markedByPlayerId: null,
						markedAt: null,
					});
				}
				await tx.mutate.round.update({
					id: args.roundId,
					status: "ended",
					endedAt,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.ended",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { roundId: args.roundId, endedAt },
				});
			},
		),

		pause: defineMutator(
			z.object({
				...withEvent,
				pauseId: z.string(),
				roundId: z.string(),
				reason: z.string().trim().min(1).max(1_000),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "pausing a round");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"pausing a round",
				);
				if (
					!round ||
					!requireActiveRoundPhase(tx, round.status, "pausing a round")
				) {
					return;
				}
				if (await findOpenPause(tx, args.roundId)) {
					refuse(tx, {
						code: "game_state_invalid",
						expected: "a round with no active pause",
						actual: "the round is already paused",
					});
					return;
				}
				const pauseWithId = await tx.run(
					zql.roundPause.where("id", args.pauseId).one(),
				);
				if (pauseWithId) {
					refuse(tx, {
						code: "not_permitted",
						reason: "a pause id cannot be reused",
					});
					return;
				}

				const startedAt = now();
				await tx.mutate.roundPause.insert({
					id: args.pauseId,
					roundId: args.roundId,
					startedAt,
					endedAt: null,
					reason: args.reason,
					startedByPlayerId: playerId,
					endedByPlayerId: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.paused",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: {
						roundId: args.roundId,
						pauseId: args.pauseId,
						reason: args.reason,
						startedAt,
					},
				});
			},
		),

		resume: defineMutator(
			z.object({ ...withEvent, roundId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireHost(tx, playerId, "resuming a round");
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"resuming a round",
				);
				if (
					!round ||
					!requireActiveRoundPhase(tx, round.status, "resuming a round")
				) {
					return;
				}
				const pause = await findOpenPause(tx, args.roundId);
				if (!pause) {
					refuse(tx, {
						code: "game_state_invalid",
						expected: "a paused round",
						actual: "the round is not paused",
					});
					return;
				}

				const endedAt = now();
				await tx.mutate.roundPause.update({
					id: pause.id,
					endedAt,
					endedByPlayerId: playerId,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.resumed",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: {
						roundId: args.roundId,
						pauseId: pause.id,
						endedAt,
						pausedMillis: Math.max(0, endedAt - pause.startedAt),
					},
				});
			},
		),

		markFound: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				hiderTeamId: z.string(),
				seekerTeamId: z.string(),
				photoId: z.string().optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"marking a hider found",
				);
				if (
					!round ||
					!requireRoundPhase(
						tx,
						round.status,
						"seeking",
						"marking a hider found",
					) ||
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"marking a hider found",
					)) ||
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.seekerTeamId,
						gameId,
						"seeker",
						"marking a hider found",
					))
				) {
					return;
				}
				if (await findOpenPause(tx, args.roundId)) {
					refuse(tx, {
						code: "game_state_invalid",
						expected: "an unpaused seeking phase",
						actual: "the round is paused",
					});
					return;
				}

				const photo = args.photoId
					? await requireOwnedPhoto(tx, args.photoId, gameId, playerId)
					: undefined;
				if (args.photoId && !photo) return;
				if (photo) {
					const attached = await tx.run(
						zql.hiderOutcome.where("photoId", photo.id),
					);
					if (
						attached.some(
							(outcome) =>
								outcome.roundId !== args.roundId ||
								outcome.hiderTeamId !== args.hiderTeamId,
						)
					) {
						refuse(tx, {
							code: "not_permitted",
							reason: "a photo can belong to only one found outcome",
						});
						return;
					}
				}

				const existing = await findOutcome(tx, args.roundId, args.hiderTeamId);
				if (existing?.foundAt != null) {
					if (existing.seekerTeamId !== args.seekerTeamId) {
						refuse(tx, {
							code: "game_state_invalid",
							expected: "the seeker team from the existing found mark",
							actual: "a different seeker team",
						});
						return;
					}
					if (!photo || existing.photoId === photo.id) return;
					if (existing.photoId) {
						await tx.mutate.photo.delete({ id: existing.photoId });
					}
					await tx.mutate.hiderOutcome.update({
						id: existing.id,
						photoId: photo.id,
					});
					await appendEvent(tx, {
						eventId: args.eventId,
						gameId,
						type: "round.hiderFound",
						actorPlayerId: playerId,
						actorTeamId: args.hiderTeamId,
						payload: {
							roundId: args.roundId,
							hiderTeamId: args.hiderTeamId,
							seekerTeamId: args.seekerTeamId,
							foundAt: existing.foundAt,
							durationMillis: existing.durationMillis,
							hasPhoto: true,
						},
					});
					return;
				}

				if (round.seekingStartedAt == null) {
					refuse(tx, {
						code: "game_state_invalid",
						expected: "a seeking phase with a start time",
						actual: "seekingStartedAt is missing",
					});
					return;
				}
				const foundAt = now();
				const pauses = await tx.run(
					zql.roundPause.where("roundId", args.roundId),
				);
				const durationMillis = elapsed(round.seekingStartedAt, pauses, foundAt);
				const markedAt = foundAt;
				await tx.mutate.hiderOutcome.upsert({
					id: existing?.id ?? outcomeId(args.roundId, args.hiderTeamId),
					roundId: args.roundId,
					hiderTeamId: args.hiderTeamId,
					seekerTeamId: args.seekerTeamId,
					foundAt,
					durationMillis,
					photoId: photo?.id ?? null,
					markedByPlayerId: playerId,
					markedAt,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.hiderFound",
					actorPlayerId: playerId,
					actorTeamId: args.hiderTeamId,
					payload: {
						roundId: args.roundId,
						hiderTeamId: args.hiderTeamId,
						seekerTeamId: args.seekerTeamId,
						foundAt,
						durationMillis,
						hasPhoto: photo !== undefined,
					},
				});
			},
		),

		unmarkFound: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				hiderTeamId: z.string(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"unmarking a hider found",
				);
				if (
					!round ||
					!requireRoundPhase(
						tx,
						round.status,
						"seeking",
						"unmarking a hider found",
					) ||
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"unmarking a hider found",
					))
				) {
					return;
				}
				const existing = await findOutcome(tx, args.roundId, args.hiderTeamId);
				if (!existing || existing.foundAt == null) return;

				if (existing.photoId) {
					await tx.mutate.photo.delete({ id: existing.photoId });
				}
				await tx.mutate.hiderOutcome.update({
					id: existing.id,
					seekerTeamId: null,
					foundAt: null,
					durationMillis: null,
					photoId: null,
					markedByPlayerId: null,
					markedAt: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.hiderFound",
					actorPlayerId: playerId,
					actorTeamId: args.hiderTeamId,
					payload: {
						roundId: args.roundId,
						hiderTeamId: args.hiderTeamId,
						seekerTeamId: null,
						foundAt: null,
						durationMillis: null,
						hasPhoto: false,
					},
				});
			},
		),

		/**
		 * The zone is materialised at commit time rather than recomputed from
		 * `stopId` plus a radius, because the radius is host-configurable and a
		 * mid-series change must not silently move a zone already committed to.
		 */
		commitZone: defineMutator(
			z.object({
				...withEvent,
				commitmentId: z.string(),
				roundId: z.string(),
				hiderTeamId: z.string(),
				stopId: z.string(),
				zone: multiPolygon,
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"committing a hiding zone",
				);
				if (
					!round ||
					!requireRoundPhase(
						tx,
						round.status,
						"hiding",
						"committing a hiding zone",
					) ||
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"committing a hiding zone",
					))
				) {
					return;
				}
				await requireTeamMember(
					tx,
					playerId,
					args.hiderTeamId,
					"committing a hiding zone",
				);
				await tx.mutate.hidingCommitment.upsert({
					id: args.commitmentId,
					roundId: args.roundId,
					hiderTeamId: args.hiderTeamId,
					stopId: args.stopId,
					zone: args.zone,
					committedAt: now(),
					declaredSpot: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.zoneCommitted",
					actorPlayerId: playerId,
					actorTeamId: args.hiderTeamId,
					// The zone itself stays out of the payload: the event log is
					// readable by everyone in the game, and this is the hiders' secret
					// until the round ends.
					payload: { roundId: args.roundId, stopId: args.stopId },
				});
			},
		),

		uncommitZone: defineMutator(
			z.object({
				...withEvent,
				roundId: z.string(),
				hiderTeamId: z.string(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"leaving a hiding zone",
				);
				if (
					!round ||
					!requireRoundPhase(
						tx,
						round.status,
						"hiding",
						"leaving a hiding zone",
					) ||
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"leaving a hiding zone",
					))
				) {
					return;
				}
				await requireTeamMember(
					tx,
					playerId,
					args.hiderTeamId,
					"leaving a hiding zone",
				);
				const existing = await tx.run(
					zql.hidingCommitment
						.where("roundId", args.roundId)
						.where("hiderTeamId", args.hiderTeamId)
						.one(),
				);
				if (!existing) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "a committed hiding zone",
							actual: "none",
						});
					}
					return;
				}
				await tx.mutate.hidingCommitment.delete({ id: existing.id });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.zoneUncommitted",
					actorPlayerId: playerId,
					actorTeamId: args.hiderTeamId,
					payload: { roundId: args.roundId, stopId: existing.stopId },
				});
			},
		),
	},

	question: {
		ask: defineMutator(
			z.object({
				...withEvent,
				questionId: z.string(),
				roundId: z.string(),
				askingTeamId: z.string(),
				targetTeamId: z.string(),
				radiusMeters: z.number().positive(),
				askPosition: positionSnapshot.nullable(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.question.insert({
					id: args.questionId,
					roundId: args.roundId,
					askingTeamId: args.askingTeamId,
					targetTeamId: args.targetTeamId,
					type: "radar",
					params: { radiusMeters: args.radiusMeters },
					// Radar is answerable the moment it is asked. Interval questions
					// enter at 'started' instead and only reach the hider on end.
					status: "pending",
					askedAt: now(),
					askPosition: args.askPosition,
					endedAt: null,
					endPosition: null,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "question.asked",
					actorPlayerId: playerId,
					actorTeamId: args.askingTeamId,
					payload: {
						questionId: args.questionId,
						type: "radar",
						radiusMeters: args.radiusMeters,
						targetTeamId: args.targetTeamId,
					},
				});
			},
		),

		/**
		 * First to the server wins. m0-spec §7.
		 *
		 * The client applies optimistically with no check — it cannot do better,
		 * since offline it has no way to know. The server checks and throws, Zero
		 * rolls the optimistic write back during rebase, and the losing client
		 * gets one dismissible notice.
		 *
		 * The check is the UNIQUE index on answer.questionId plus one
		 * disambiguation: an existing answer from the *same* player is this
		 * player's own retry, and succeeds silently. There is no separate
		 * idempotency key, because the natural key already carries everything
		 * needed.
		 */
		answer: defineMutator(
			z.object({
				...withEvent,
				answerId: z.string(),
				constraintId: z.string(),
				questionId: z.string(),
				value: answerValue,
				answerPosition: positionSnapshot.nullable(),
				clientSubmittedAt: z.number(),
				answeredAfterMs: z.number().int().nonnegative(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);

				const existing = await tx.run(
					zql.answer.where("questionId", args.questionId).one(),
				);
				if (existing) {
					if (existing.answeringPlayerId === playerId) {
						// Nothing happened twice.
						return;
					}
					if (tx.location !== "server") {
						/**
						 * The client applies optimistically with no check, and that
						 * includes rebase. By the time a queued answer is rebased the
						 * winner is already in the local store, and throwing here fails
						 * the whole poke and takes the connection down with it. The
						 * server's rejection below is what reaches the player.
						 */
						return;
					}
					const other = await tx.run(
						zql.player.where("id", existing.answeringPlayerId).one(),
					);
					reject({
						code: "team_action_superseded",
						questionId: args.questionId,
						acceptedBy: {
							playerId: existing.answeringPlayerId,
							displayName: other?.displayName ?? "a teammate",
						},
						acceptedAt: existing.serverReceivedAt,
					});
				}

				try {
					await tx.mutate.answer.insert({
						id: args.answerId,
						questionId: args.questionId,
						answeringPlayerId: playerId,
						value: args.value,
						answerPosition: args.answerPosition,
						clientSubmittedAt: args.clientSubmittedAt,
						answeredAfterMs: args.answeredAfterMs,
						serverReceivedAt: now(),
					});
				} catch (error) {
					/**
					 * The read above and this index are two chances at the same check,
					 * and which one fires is a matter of timing. Translating here means
					 * the loser gets the same rejection either way instead of a raw
					 * constraint violation. m0-spec §7.
					 */
					if (isDuplicateAnswer(error)) {
						reject({
							code: "team_action_superseded",
							questionId: args.questionId,
						});
					}
					throw error;
				}
				await tx.mutate.question.update({
					id: args.questionId,
					status: "answered",
				});

				await createAnswerConstraint(tx, {
					constraintId: args.constraintId,
					questionId: args.questionId,
					answerId: args.answerId,
					value: args.value,
				});

				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "question.answered",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { questionId: args.questionId, value: args.value },
					clientSubmittedAt: args.clientSubmittedAt,
				});
			},
		),

		cancel: defineMutator(
			z.object({ ...withEvent, questionId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.question.update({
					id: args.questionId,
					status: "cancelled",
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "question.cancelled",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { questionId: args.questionId },
				});
			},
		),
	},

	constraint: {
		/**
		 * Disabling is a column, not a deletion — and this one mutator is also how
		 * a hider's answer correction and the bulk "we are searching this zone now"
		 * invalidation will be expressed. One operation, not three features.
		 */
		setEnabled: defineMutator(
			z.object({
				...withEvent,
				constraintId: z.string(),
				enabled: z.boolean(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const constraint = await tx.run(
					zql.constraint.where("id", args.constraintId).one(),
				);
				if (!constraint) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing constraint",
							actual: "no such constraint",
						});
					}
					return;
				}
				await requireTeamMember(
					tx,
					playerId,
					constraint.seekerTeamId,
					"toggling a constraint",
				);
				await tx.mutate.constraint.update({
					id: args.constraintId,
					enabled: args.enabled,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "constraint.enabledChanged",
					actorPlayerId: playerId,
					actorTeamId: constraint.seekerTeamId,
					payload: { constraintId: args.constraintId, enabled: args.enabled },
				});
			},
		),

		setName: defineMutator(
			z.object({
				...withEvent,
				constraintId: z.string(),
				name: z.string().max(80).nullable(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const constraint = await tx.run(
					zql.constraint.where("id", args.constraintId).one(),
				);
				if (!constraint) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing constraint",
							actual: "no such constraint",
						});
					}
					return;
				}
				await requireTeamMember(
					tx,
					playerId,
					constraint.seekerTeamId,
					"naming a constraint",
				);
				const name = args.name?.trim() || null;
				await tx.mutate.constraint.update({
					id: args.constraintId,
					name,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "constraint.renamed",
					actorPlayerId: playerId,
					actorTeamId: constraint.seekerTeamId,
					payload: { constraintId: args.constraintId, name },
				});
			},
		),

		/**
		 * A hand-authored constraint is the same record with `source: 'manual'` and
		 * a null `answerId` — a seeker team drawing a radius around a building they
		 * identified from a photo. Not a v1 feature; here because the whole point
		 * of the constraint table's shape is that it costs nothing to support.
		 */
		createManual: defineMutator(
			z.object({
				...withEvent,
				constraintId: z.string(),
				roundId: z.string(),
				seekerTeamId: z.string(),
				hiderTeamId: z.string(),
				geometry: constraintGeometry,
				mode: z.enum(["include", "exclude"]),
				ordinal: z.number().int().nonnegative(),
				name: z.string().max(80).nullable(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireTeamMember(
					tx,
					playerId,
					args.seekerTeamId,
					"creating a constraint",
				);
				await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"creating a constraint",
				);
				if (
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.seekerTeamId,
						gameId,
						"seeker",
						"creating a constraint",
					))
				) {
					return;
				}
				if (
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"creating a constraint",
					))
				) {
					return;
				}
				await tx.mutate.constraint.insert({
					id: args.constraintId,
					roundId: args.roundId,
					seekerTeamId: args.seekerTeamId,
					hiderTeamId: args.hiderTeamId,
					source: "manual",
					answerId: null,
					geometry: args.geometry,
					mode: args.mode,
					name: args.name?.trim() || null,
					enabled: true,
					ordinal: args.ordinal,
					createdAt: now(),
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "constraint.created",
					actorPlayerId: playerId,
					actorTeamId: args.seekerTeamId,
					payload: { constraintId: args.constraintId, source: "manual" },
				});
			},
		),

		/**
		 * The M13 macro: they are in this station's hiding zone now, so every
		 * earlier cut is stale. Disable the rest (do not delete them) and fold in
		 * an include-radius of `hidingRadiusMeters` around the stop.
		 */
		suspectHidingZone: defineMutator(
			z.object({
				...withEvent,
				constraintId: z.string(),
				roundId: z.string(),
				seekerTeamId: z.string(),
				hiderTeamId: z.string(),
				lng: longitude,
				lat: latitude,
				radiusMeters,
				name: z.string().max(80).nullable(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireTeamMember(
					tx,
					playerId,
					args.seekerTeamId,
					"suspecting a hiding zone",
				);
				const round = await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"suspecting a hiding zone",
				);
				if (!round) return;
				if (
					!requireRoundPhase(
						tx,
						round.status,
						"seeking",
						"suspecting a hiding zone",
					)
				) {
					return;
				}
				if (
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.seekerTeamId,
						gameId,
						"seeker",
						"suspecting a hiding zone",
					))
				) {
					return;
				}
				if (
					!(await requireTeamForRole(
						tx,
						args.roundId,
						args.hiderTeamId,
						gameId,
						"hider",
						"suspecting a hiding zone",
					))
				) {
					return;
				}

				const rows = await tx.run(
					zql.constraint.where("roundId", args.roundId),
				);
				const scoped = rows.filter(
					(row) =>
						row.seekerTeamId === args.seekerTeamId &&
						row.hiderTeamId === args.hiderTeamId,
				);
				const toDisable = scoped.filter((row) => row.enabled);
				for (const row of toDisable) {
					await tx.mutate.constraint.update({
						id: row.id,
						enabled: false,
					});
				}
				const ordinal =
					scoped.reduce((max, row) => Math.max(max, row.ordinal), -1) + 1;
				await tx.mutate.constraint.insert({
					id: args.constraintId,
					roundId: args.roundId,
					seekerTeamId: args.seekerTeamId,
					hiderTeamId: args.hiderTeamId,
					source: "manual",
					answerId: null,
					geometry: {
						kind: "radius",
						centers: [[args.lng, args.lat]],
						radius: args.radiusMeters,
					},
					mode: "include",
					name: args.name?.trim() || null,
					enabled: true,
					ordinal,
					createdAt: now(),
				});
				await appendEvents(tx, gameId, [
					...toDisable.map((row) => ({
						eventId: `${args.eventId}:off:${row.id}`,
						type: "constraint.enabledChanged" as const,
						actorPlayerId: playerId,
						actorTeamId: args.seekerTeamId,
						payload: { constraintId: row.id, enabled: false },
					})),
					{
						eventId: args.eventId,
						type: "constraint.created" as const,
						actorPlayerId: playerId,
						actorTeamId: args.seekerTeamId,
						payload: { constraintId: args.constraintId, source: "manual" },
					},
				]);
			},
		),

		/**
		 * Hand-authored rows can be removed. Answer-sourced rows stay disable-only
		 * — a correction rewrites them in place rather than leaving a hole in the
		 * fold. M7 owns that write.
		 */
		remove: defineMutator(
			z.object({
				...withEvent,
				constraintId: z.string(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const constraint = await tx.run(
					zql.constraint.where("id", args.constraintId).one(),
				);
				if (!constraint) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing constraint",
							actual: "no such constraint",
						});
					}
					return;
				}
				await requireTeamMember(
					tx,
					playerId,
					constraint.seekerTeamId,
					"removing a constraint",
				);
				if (constraint.source !== "manual") {
					refuse(tx, {
						code: "not_permitted",
						reason: "only a hand-authored constraint can be removed",
					});
					return;
				}
				await tx.mutate.constraint.delete({ id: args.constraintId });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "constraint.deleted",
					actorPlayerId: playerId,
					actorTeamId: constraint.seekerTeamId,
					payload: { constraintId: args.constraintId },
				});
			},
		),
	},

	pin: {
		create: defineMutator(
			z.object({
				...withEvent,
				pinId: z.string(),
				teamId: z.string(),
				roundId: z.string().nullable(),
				lng: longitude,
				lat: latitude,
				radiusMeters: radiusMeters.nullable(),
				label: z.string().max(120),
				note: z.string().max(10_000),
				color: z.string().min(1).max(100),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireTeamInGame(tx, args.teamId, gameId, "creating a pin");
				await requireTeamMember(tx, playerId, args.teamId, "creating a pin");
				if (args.roundId !== null) {
					await requireRoundInGame(tx, args.roundId, gameId, "creating a pin");
				}

				const createdAt = now();
				await tx.mutate.pin.insert({
					id: args.pinId,
					gameId,
					teamId: args.teamId,
					roundId: args.roundId,
					createdByPlayerId: playerId,
					lng: args.lng,
					lat: args.lat,
					radiusMeters: args.radiusMeters,
					label: args.label,
					note: args.note,
					color: args.color,
					createdAt,
					updatedAt: createdAt,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "pin.created",
					actorPlayerId: playerId,
					actorTeamId: args.teamId,
					payload: {
						pinId: args.pinId,
						lng: args.lng,
						lat: args.lat,
						radiusMeters: args.radiusMeters,
						label: args.label,
						color: args.color,
					},
				});
			},
		),

		update: defineMutator(
			z.object({
				...withEvent,
				pinId: z.string(),
				lng: longitude.optional(),
				lat: latitude.optional(),
				radiusMeters: radiusMeters.nullable().optional(),
				label: z.string().max(120).optional(),
				note: z.string().max(10_000).optional(),
				color: z.string().min(1).max(100).optional(),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const pin = await tx.run(zql.pin.where("id", args.pinId).one());
				if (!pin) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing pin in this game",
							actual: "no such pin",
						});
					}
					return;
				}
				if (pin.gameId !== gameId) {
					refuse(tx, {
						code: "not_permitted",
						reason: "editing a pin is limited to this game",
					});
					return;
				}
				await requireTeamInGame(tx, pin.teamId, gameId, "editing a pin");
				await requireTeamMember(tx, playerId, pin.teamId, "editing a pin");

				const changes: {
					lng?: number;
					lat?: number;
					radiusMeters?: number | null;
					label?: string;
					note?: string;
					color?: string;
				} = {};
				if (args.lng !== undefined) changes.lng = args.lng;
				if (args.lat !== undefined) changes.lat = args.lat;
				if (args.radiusMeters !== undefined)
					changes.radiusMeters = args.radiusMeters;
				if (args.label !== undefined) changes.label = args.label;
				if (args.note !== undefined) changes.note = args.note;
				if (args.color !== undefined) changes.color = args.color;
				if (Object.keys(changes).length === 0) return;

				await tx.mutate.pin.update({
					id: args.pinId,
					...changes,
					updatedAt: now(),
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "pin.updated",
					actorPlayerId: playerId,
					actorTeamId: pin.teamId,
					payload: { pinId: args.pinId, ...changes },
				});
			},
		),

		delete: defineMutator(
			z.object({ ...withEvent, pinId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const pin = await tx.run(zql.pin.where("id", args.pinId).one());
				if (!pin) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing pin in this game",
							actual: "no such pin",
						});
					}
					return;
				}
				if (pin.gameId !== gameId) {
					refuse(tx, {
						code: "not_permitted",
						reason: "deleting a pin is limited to this game",
					});
					return;
				}
				await requireTeamInGame(tx, pin.teamId, gameId, "deleting a pin");
				await requireTeamMember(tx, playerId, pin.teamId, "deleting a pin");

				await tx.mutate.pin.delete({ id: args.pinId });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "pin.deleted",
					actorPlayerId: playerId,
					actorTeamId: pin.teamId,
					payload: { pinId: args.pinId },
				});
			},
		),
	},

	searchZone: {
		declare: defineMutator(
			z.object({
				...withEvent,
				zoneId: z.string(),
				roundId: z.string(),
				seekerTeamId: z.string(),
				stopId: z.string().nullable(),
				lng: longitude,
				lat: latitude,
				radiusMeters,
				note: z.string().max(10_000),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await requireTeamInGame(
					tx,
					args.seekerTeamId,
					gameId,
					"declaring a search zone",
				);
				await requireTeamMember(
					tx,
					playerId,
					args.seekerTeamId,
					"declaring a search zone",
				);
				await requireRoundInGame(
					tx,
					args.roundId,
					gameId,
					"declaring a search zone",
				);
				await requireSeekerRole(
					tx,
					args.roundId,
					args.seekerTeamId,
					"declaring a search zone",
				);

				const zoneWithId = await tx.run(
					zql.searchZone.where("id", args.zoneId).one(),
				);
				if (
					zoneWithId &&
					(zoneWithId.roundId !== args.roundId ||
						zoneWithId.seekerTeamId !== args.seekerTeamId)
				) {
					refuse(tx, {
						code: "not_permitted",
						reason: "a search-zone id cannot be moved to another scope",
					});
				}
				const existing = await tx.run(
					zql.searchZone
						.where("roundId", args.roundId)
						.where("seekerTeamId", args.seekerTeamId)
						.one(),
				);
				if (existing && existing.id !== args.zoneId) {
					await tx.mutate.searchZone.delete({ id: existing.id });
				}

				await tx.mutate.searchZone.upsert({
					id: args.zoneId,
					roundId: args.roundId,
					seekerTeamId: args.seekerTeamId,
					stopId: args.stopId,
					lng: args.lng,
					lat: args.lat,
					radiusMeters: args.radiusMeters,
					note: args.note,
					declaredByPlayerId: playerId,
					declaredAt: now(),
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "searchZone.declared",
					actorPlayerId: playerId,
					actorTeamId: args.seekerTeamId,
					payload: {
						zoneId: args.zoneId,
						stopId: args.stopId,
						lng: args.lng,
						lat: args.lat,
						radiusMeters: args.radiusMeters,
						note: args.note,
					},
				});
			},
		),

		clear: defineMutator(
			z.object({ ...withEvent, zoneId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const zone = await tx.run(
					zql.searchZone.where("id", args.zoneId).one(),
				);
				if (!zone) {
					if (tx.location === "server") {
						reject({
							code: "game_state_invalid",
							expected: "an existing search zone in this game",
							actual: "no such search zone",
						});
					}
					return;
				}
				await requireRoundInGame(
					tx,
					zone.roundId,
					gameId,
					"clearing a search zone",
				);
				await requireTeamInGame(
					tx,
					zone.seekerTeamId,
					gameId,
					"clearing a search zone",
				);
				await requireTeamMember(
					tx,
					playerId,
					zone.seekerTeamId,
					"clearing a search zone",
				);
				await requireSeekerRole(
					tx,
					zone.roundId,
					zone.seekerTeamId,
					"clearing a search zone",
				);

				await tx.mutate.searchZone.delete({ id: args.zoneId });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "searchZone.cleared",
					actorPlayerId: playerId,
					actorTeamId: zone.seekerTeamId,
					payload: { zoneId: args.zoneId },
				});
			},
		),
	},

	position: {
		/**
		 * The durable position log, flushed from a local queue. Deliberately not an
		 * event: a track is a stream of samples, and putting thousands of them
		 * through the log would drown the thing M14 reads it for. m0-spec §8.
		 */
		record: defineMutator(
			z.object({
				snapshots: z
					.array(
						z.object({
							id: z.string(),
							roundId: z.string().nullable(),
							teamId: z.string(),
							fix: clientFix,
							reason: z.enum([
								"interval",
								"question.asked",
								"question.ended",
								"question.answered",
							]),
						}),
					)
					.max(500),
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const receivedAt = now();
				for (const snapshot of args.snapshots) {
					await tx.mutate.positionSnapshot.upsert({
						id: snapshot.id,
						gameId,
						roundId: snapshot.roundId,
						playerId,
						teamId: snapshot.teamId,
						fix: snapshot.fix,
						// The sender's own clock, trusted and propagated unchanged. A
						// batch flushed after ten minutes underground must not all claim
						// to have happened when the signal came back.
						capturedAt: snapshot.fix.capturedAt,
						receivedAt,
						reason: snapshot.reason,
					});
				}
			},
		),
	},
});

async function setHost(
	tx: Tx,
	ctx: GameContext,
	eventId: string,
	isHost: boolean,
): Promise<void> {
	await tx.mutate.player.update({ id: ctx.playerId, isHost });
	await appendEvent(tx, {
		eventId,
		gameId: ctx.gameId,
		type: "host.changed",
		actorPlayerId: ctx.playerId,
		actorTeamId: null,
		payload: { playerId: ctx.playerId, isHost },
	});
}

/**
 * A player belongs to at most one team (§5), but this reads the set rather than
 * the row: the invariant is new, and a mutator that assumes it while cleaning up
 * after it would leave exactly the rows it exists to remove.
 */
async function dropMemberships(tx: Tx, playerId: string): Promise<void> {
	for (const membership of await tx.run(
		zql.teamMember.where("playerId", playerId),
	)) {
		await tx.mutate.teamMember.delete({
			teamId: membership.teamId,
			playerId,
		});
	}
}

async function requireTeamInGame(
	tx: Tx,
	teamId: string,
	gameId: string,
	action: string,
): Promise<void> {
	const team = await tx.run(zql.team.where("id", teamId).one());
	if (!team) {
		// A cold optimistic store cannot prove the scope. The server always can.
		if (tx.location === "server") {
			reject({
				code: "game_state_invalid",
				expected: "a team in this game",
				actual: "no such team",
			});
		}
		return;
	}
	if (team.gameId !== gameId) {
		refuse(tx, {
			code: "not_permitted",
			reason: `${action} is limited to this game`,
		});
	}
}

async function requireRoundInGame(
	tx: Tx,
	roundId: string,
	gameId: string,
	action: string,
) {
	const round = await tx.run(zql.round.where("id", roundId).one());
	if (!round) {
		if (tx.location === "server") {
			reject({
				code: "game_state_invalid",
				expected: "a round in this game",
				actual: "no such round",
			});
		}
		return undefined;
	}
	if (round.gameId !== gameId) {
		refuse(tx, {
			code: "not_permitted",
			reason: `${action} is limited to this game's rounds`,
		});
		return undefined;
	}
	return round;
}

function requireRoundPhase(
	tx: Tx,
	actual: RoundStatus,
	expected: RoundStatus,
	action: string,
): boolean {
	if (actual === expected) return true;
	refuse(tx, {
		code: "game_state_invalid",
		expected: `${expected} before ${action}`,
		actual,
	});
	return false;
}

function requireActiveRoundPhase(
	tx: Tx,
	actual: RoundStatus,
	action: string,
): boolean {
	if (actual === "hiding" || actual === "seeking") return true;
	refuse(tx, {
		code: "game_state_invalid",
		expected: `hiding or seeking before ${action}`,
		actual,
	});
	return false;
}

async function findOpenPause(tx: Tx, roundId: string) {
	const pauses = await tx.run(zql.roundPause.where("roundId", roundId));
	return pauses.find((pause) => pause.endedAt == null);
}

async function requireNoOpenPause(
	tx: Tx,
	roundId: string,
	action: string,
): Promise<boolean> {
	if (!(await findOpenPause(tx, roundId))) return true;
	refuse(tx, {
		code: "game_state_invalid",
		expected: `an unpaused round before ${action}`,
		actual: "the round is paused",
	});
	return false;
}

async function requireTeamForRole(
	tx: Tx,
	roundId: string,
	teamId: string,
	gameId: string,
	expectedRole: TeamRole,
	action: string,
): Promise<boolean> {
	const team = await tx.run(zql.team.where("id", teamId).one());
	if (!team) {
		if (tx.location === "server") {
			reject({
				code: "game_state_invalid",
				expected: `a ${expectedRole} team in this game`,
				actual: "no such team",
			});
		}
		return false;
	}
	if (team.gameId !== gameId) {
		refuse(tx, {
			code: "not_permitted",
			reason: `${action} is limited to teams in this game`,
		});
		return false;
	}

	const role = await tx.run(
		zql.roundTeamRole.where("roundId", roundId).where("teamId", teamId).one(),
	);
	if (role?.role === expectedRole) return true;
	refuse(tx, {
		code: "not_permitted",
		reason: `${action} requires ${teamId} to be a ${expectedRole} team`,
	});
	return false;
}

async function requireOwnedPhoto(
	tx: Tx,
	photoId: string,
	gameId: string,
	playerId: string,
) {
	const photo = await tx.run(zql.photo.where("id", photoId).one());
	if (!photo) {
		if (tx.location === "server") {
			reject({
				code: "game_state_invalid",
				expected: "an uploaded photo in this game",
				actual: "no such photo",
			});
		}
		return undefined;
	}
	if (photo.gameId !== gameId || photo.uploadedByPlayerId !== playerId) {
		refuse(tx, {
			code: "not_permitted",
			reason: "a found photo must belong to its game and uploader",
		});
		return undefined;
	}
	return photo;
}

async function findOutcome(tx: Tx, roundId: string, hiderTeamId: string) {
	return tx.run(
		zql.hiderOutcome
			.where("roundId", roundId)
			.where("hiderTeamId", hiderTeamId)
			.one(),
	);
}

function outcomeId(roundId: string, hiderTeamId: string): string {
	return `${roundId}:${hiderTeamId}`;
}

async function requireSeekerRole(
	tx: Tx,
	roundId: string,
	teamId: string,
	action: string,
): Promise<void> {
	const role = await tx.run(
		zql.roundTeamRole.where("roundId", roundId).where("teamId", teamId).one(),
	);
	if (role?.role === "seeker") return;

	// `queries.rounds()` carries all role rows with a known round, so a client
	// that knows the round can make the same decision without blocking offline
	// writes. A cold store defers the decision to the server.
	if (tx.location !== "server") {
		const round = await tx.run(zql.round.where("id", roundId).one());
		if (!round) return;
	}
	refuse(tx, {
		code: "not_permitted",
		reason: `${action} is for seeker teams`,
	});
}

/**
 * The constraint an answer implies, derived by the same pure function the
 * hider-side suggestion in M8 will use.
 *
 * On a client that does not have the question cached — an offline hider whose
 * question card came in before the query went cold — this quietly does nothing.
 * That is correct rather than a compromise: the constraint belongs to the
 * *seeker* team's deductions, the answering player is a hider, and the server
 * writes it authoritatively the moment the answer arrives.
 */
async function createAnswerConstraint(
	tx: Tx,
	input: {
		constraintId: string;
		questionId: string;
		answerId: string;
		value: { kind: "boolean"; value: boolean };
	},
): Promise<void> {
	const question = await tx.run(
		zql.question.where("id", input.questionId).one(),
	);
	if (!question) return;

	const askPosition = question.askPosition;
	const params = question.params;
	const radiusMeters =
		typeof params === "object" &&
		params !== null &&
		!Array.isArray(params) &&
		typeof params.radiusMeters === "number"
			? params.radiusMeters
			: null;
	if (radiusMeters === null) return;

	const shape = answerToConstraintGeometry({
		question: { type: "radar", params: { radiusMeters } },
		askPosition:
			askPosition && askPosition.source !== "unavailable"
				? [askPosition.lng, askPosition.lat]
				: null,
		endPosition: null,
		value: input.value,
	});
	if (!shape) return;

	const siblings = await tx.run(
		zql.constraint
			.where("roundId", question.roundId)
			.where("seekerTeamId", question.askingTeamId)
			.where("hiderTeamId", question.targetTeamId),
	);

	const existing = await tx.run(
		zql.constraint.where("id", input.constraintId).one(),
	);

	await tx.mutate.constraint.upsert({
		id: input.constraintId,
		roundId: question.roundId,
		seekerTeamId: question.askingTeamId,
		hiderTeamId: question.targetTeamId,
		source: "answer",
		answerId: input.answerId,
		geometry: shape.geometry,
		mode: shape.mode,
		name: existing?.name ?? null,
		enabled: true,
		// Only a caching detail — the fold commutes, so this does not affect the
		// result. m0-spec §9.
		ordinal: siblings.length,
		createdAt: now(),
	});
}
