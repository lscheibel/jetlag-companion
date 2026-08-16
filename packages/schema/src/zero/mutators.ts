import {
	ApplicationError,
	defineMutator,
	defineMutators,
	type Transaction,
} from "@rocicorp/zero";
import { answerToConstraintGeometry } from "@zero-lag/rules";
import { z } from "zod";
import type { EventType, GameContext, Json, MutationRejection } from "../types";
import { zql } from "./schema";

/**
 * Every mutator writes the state rows the UI queries **and** an event row, in
 * one transaction. There is no exception to this, and a state write with no
 * event is a defect. m0-spec §6.
 */

function requireContext(ctx: GameContext | undefined): GameContext {
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

function reject(rejection: MutationRejection): never {
	throw new ApplicationError(rejection.code, { details: rejection });
}

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

const lngLat = z.tuple([z.number(), z.number()]);
const multiPolygon = z.array(z.array(z.array(lngLat)));

/** Mirrors `ConstraintGeometry` in @zero-lag/rules — the four kinds of §9. */
const constraintGeometry = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("radius"), center: lngLat, radius: z.number() }),
	z.object({
		kind: z.literal("halfPlane"),
		a: lngLat,
		b: lngLat,
		nearer: z.enum(["a", "b"]),
	}),
	z.object({ kind: z.literal("polygon"), polygons: multiPolygon }),
	z.object({
		kind: z.literal("sector"),
		center: lngLat,
		radius: z.number(),
		fromDeg: z.number(),
		toDeg: z.number(),
	}),
]);

const withEvent = { eventId: z.string() };

type Tx = Transaction;

async function appendEvent(
	tx: Tx,
	entry: {
		eventId: string;
		gameId: string;
		type: EventType;
		actorPlayerId: string | null;
		actorTeamId: string | null;
		payload: Json;
		clientSubmittedAt?: number | null;
	},
): Promise<void> {
	const game = await tx.run(zql.game.where("id", entry.gameId).one());
	if (!game) {
		reject({
			code: "game_state_invalid",
			expected: "an existing game",
			actual: "no such game",
		});
	}

	// Allocated inside the mutator transaction from a per-game counter, so
	// replay ordering is total and gap-free.
	const seq = game.eventSeq + 1;
	await tx.mutate.game.update({ id: entry.gameId, eventSeq: seq });
	await tx.mutate.event.insert({
		id: entry.eventId,
		gameId: entry.gameId,
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
	player: {
		rename: defineMutator(
			z.object({ ...withEvent, displayName: z.string().min(1).max(40) }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.player.update({
					id: playerId,
					displayName: args.displayName,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "player.renamed",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { displayName: args.displayName },
				});
			},
		),
	},

	team: {
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
				await tx.mutate.team.insert({
					id: args.teamId,
					gameId,
					name: args.name,
					color: args.color,
					emoji: args.emoji,
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

		join: defineMutator(
			z.object({ ...withEvent, teamId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.teamMember.upsert({
					teamId: args.teamId,
					playerId,
					joinedAt: now(),
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "team.memberJoined",
					actorPlayerId: playerId,
					actorTeamId: args.teamId,
					payload: {},
				});
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
				await tx.mutate.round.insert({
					id: args.roundId,
					gameId,
					ordinal: args.ordinal,
					status: "hiding",
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

		startHiding: defineMutator(
			z.object({ ...withEvent, roundId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				const startedAt = now();
				await tx.mutate.round.update({
					id: args.roundId,
					status: "hiding",
					hidingStartedAt: startedAt,
				});
				await tx.mutate.game.update({ id: gameId, status: "running" });
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "round.hidingStarted",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { roundId: args.roundId, startedAt },
				});
			},
		),

		startSeeking: defineMutator(
			z.object({ ...withEvent, roundId: z.string() }),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
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
				const endedAt = now();
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
				await tx.mutate.constraint.update({
					id: args.constraintId,
					enabled: args.enabled,
				});
				await appendEvent(tx, {
					eventId: args.eventId,
					gameId,
					type: "constraint.enabledChanged",
					actorPlayerId: playerId,
					actorTeamId: null,
					payload: { constraintId: args.constraintId, enabled: args.enabled },
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
			}),
			async ({ tx, ctx, args }) => {
				const { playerId, gameId } = requireContext(ctx);
				await tx.mutate.constraint.insert({
					id: args.constraintId,
					roundId: args.roundId,
					seekerTeamId: args.seekerTeamId,
					hiderTeamId: args.hiderTeamId,
					source: "manual",
					answerId: null,
					geometry: args.geometry,
					mode: args.mode,
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

	await tx.mutate.constraint.upsert({
		id: input.constraintId,
		roundId: question.roundId,
		seekerTeamId: question.askingTeamId,
		hiderTeamId: question.targetTeamId,
		source: "answer",
		answerId: input.answerId,
		geometry: shape.geometry,
		mode: shape.mode,
		enabled: true,
		// Only a caching detail — the fold commutes, so this does not affect the
		// result. m0-spec §9.
		ordinal: siblings.length,
		createdAt: now(),
	});
}
