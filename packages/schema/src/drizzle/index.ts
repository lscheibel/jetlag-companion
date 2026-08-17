import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	AnswerValue,
	ClientFix,
	ConstraintGeometry,
	ConstraintMode,
	ConstraintSource,
	EventType,
	GameStatus,
	Json,
	PositionReason,
	PositionSnapshot,
	QuestionStatus,
	QuestionType,
	RoundStatus,
	StoredHidingRadii,
	StoredMultiPolygon,
	TeamRole,
} from "../types";

/**
 * Drizzle is the source of truth for DDL; the Zero schema in ../zero/schema.ts
 * is derived from it by hand, and `schema.test.ts` fails if the two drift.
 * m0-spec §5.
 *
 * Two conventions worth stating once:
 *
 * - Identifiers are camelCase in Postgres too. Drizzle quotes them, so the
 *   Drizzle name, the Postgres name and the Zero name are all the same string
 *   and there is no mapping layer to get wrong.
 * - Every instant is epoch milliseconds in an int8, never a Postgres timestamp.
 *   §7 is built on three clocks that mean different things; a column type that
 *   silently reinterprets one of them in a different timezone would be a very
 *   quiet bug.
 */

const epochMs = (name: string) => bigint(name, { mode: "number" });

export const game = pgTable(
	"game",
	{
		id: text("id").primaryKey(),
		/** Short join code, unique among active games. */
		code: text("code").notNull(),
		status: text("status").$type<GameStatus>().notNull(),
		/**
		 * Who opened the game. It never changes and nothing authorizes against it
		 * — that is `player.isHost`, which any player can claim or release. Two
		 * columns both called "host" meaning different things is how a later
		 * milestone checks the wrong one. m1-spec §6.
		 */
		createdByPlayerId: text("createdByPlayerId").notNull(),
		mapConfigId: text("mapConfigId"),
		/**
		 * The per-game monotonic counter §6 allocates `event.seq` from, held here
		 * so the allocation happens inside the mutator's own transaction.
		 */
		eventSeq: integer("eventSeq").notNull().default(0),
		/** m0-spec §8: the interval wants to be a knob rather than a constant. */
		positionIntervalMs: integer("positionIntervalMs").notNull().default(30_000),
		createdAt: epochMs("createdAt").notNull(),
		startedAt: epochMs("startedAt"),
		endedAt: epochMs("endedAt"),
	},
	(table) => [uniqueIndex("game_code_idx").on(table.code)],
);

export const mapConfig = pgTable("mapConfig", {
	id: text("id").primaryKey(),
	gameId: text("gameId").notNull(),
	areaPackId: text("areaPackId").notNull(),
	areaPackVersion: text("areaPackVersion").notNull(),
	/**
	 * Stored, not derived on demand — the seed of every fold. m0-spec §11.
	 *
	 * WGS84 lng/lat, like every other coordinate in the system. The projection
	 * column that used to sit beside it is gone: booleans are topological and
	 * need no metric, so there was never a frame for this to be in. m0-spec §9.
	 */
	validHidingArea: jsonb("validHidingArea")
		.$type<StoredMultiPolygon>()
		.notNull(),
	enabledStopIds: jsonb("enabledStopIds").$type<string[]>().notNull(),
	hidingRadiusByMode: jsonb("hidingRadiusByMode")
		.$type<StoredHidingRadii>()
		.notNull(),
	contentHash: text("contentHash").notNull(),
});

export const player = pgTable(
	"player",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		displayName: text("displayName").notNull(),
		deviceId: text("deviceId").notNull(),
		joinedAt: epochMs("joinedAt").notNull(),
		/**
		 * The host hat. Seeded true for whoever created the game; any player can
		 * put it on or take it off, and more than one can wear it at once — the
		 * role exists because some players are new to the game, not because
		 * anyone needs authority over anyone. m1-spec §6.
		 */
		isHost: boolean("isHost").notNull().default(false),
		/**
		 * Departure is a column, never a delete: `event.actorPlayerId`,
		 * `answer.answeringPlayerId` and `positionSnapshot.playerId` all point
		 * here, and M14 replays a game with names attached. m1-spec §7.
		 */
		leftAt: epochMs("leftAt"),
		/** Set only when a host removed them — the difference is what the join endpoint reads. */
		removedByPlayerId: text("removedByPlayerId"),
	},
	(table) => [index("player_game_idx").on(table.gameId)],
);

/** No role column — see roundTeamRole. Teams keep their identity across a game. */
export const team = pgTable(
	"team",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		emoji: text("emoji").notNull(),
		/** Ordering that a rename does not disturb. m1-spec §2. */
		createdAt: epochMs("createdAt").notNull(),
	},
	(table) => [index("team_game_idx").on(table.gameId)],
);

export const teamMember = pgTable(
	"teamMember",
	{
		teamId: text("teamId").notNull(),
		playerId: text("playerId").notNull(),
		joinedAt: epochMs("joinedAt").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.teamId, table.playerId] }),
		/**
		 * UNIQUE, and that is the whole of "one player, one team". A `player` row
		 * belongs to exactly one game, so uniqueness on `playerId` says it without
		 * a composite key and without denormalising `gameId` onto the membership.
		 * `team.join` deletes before it inserts, in the same transaction, or this
		 * index rejects the move it exists to protect. m1-spec §5.
		 */
		uniqueIndex("teamMember_player_idx").on(table.playerId),
	],
);

export const round = pgTable(
	"round",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		ordinal: integer("ordinal").notNull(),
		status: text("status").$type<RoundStatus>().notNull(),
		hidingDurationMs: integer("hidingDurationMs").notNull(),
		hidingStartedAt: epochMs("hidingStartedAt"),
		seekingStartedAt: epochMs("seekingStartedAt"),
		endedAt: epochMs("endedAt"),
	},
	(table) => [
		uniqueIndex("round_game_ordinal_idx").on(table.gameId, table.ordinal),
	],
);

export const roundTeamRole = pgTable(
	"roundTeamRole",
	{
		roundId: text("roundId").notNull(),
		teamId: text("teamId").notNull(),
		role: text("role").$type<TeamRole>().notNull(),
	},
	(table) => [primaryKey({ columns: [table.roundId, table.teamId] })],
);

export const hidingCommitment = pgTable(
	"hidingCommitment",
	{
		id: text("id").primaryKey(),
		roundId: text("roundId").notNull(),
		hiderTeamId: text("hiderTeamId").notNull(),
		stopId: text("stopId").notNull(),
		/**
		 * Materialised rather than recomputed from `stopId` plus the map config's
		 * radius, because the radius is host-configurable and a mid-series change
		 * must not silently move a zone that has already been committed to.
		 */
		zone: jsonb("zone").$type<StoredMultiPolygon>().notNull(),
		committedAt: epochMs("committedAt").notNull(),
		declaredSpot: jsonb("declaredSpot").$type<[number, number] | null>(),
	},
	(table) => [
		uniqueIndex("hidingCommitment_round_team_idx").on(
			table.roundId,
			table.hiderTeamId,
		),
	],
);

export const question = pgTable(
	"question",
	{
		id: text("id").primaryKey(),
		roundId: text("roundId").notNull(),
		askingTeamId: text("askingTeamId").notNull(),
		targetTeamId: text("targetTeamId").notNull(),
		type: text("type").$type<QuestionType>().notNull(),
		params: jsonb("params").$type<Json>().notNull(),
		status: text("status").$type<QuestionStatus>().notNull(),
		askedAt: epochMs("askedAt").notNull(),
		askPosition: jsonb("askPosition").$type<PositionSnapshot | null>(),
		/**
		 * `status: 'started'` and the two position columns exist from day one
		 * because of thermometers: starting one records a position and announces
		 * itself, and it is nothing but game state until the team ends it
		 * somewhere else. Radar never uses them. m0-spec §5.
		 */
		endedAt: epochMs("endedAt"),
		endPosition: jsonb("endPosition").$type<PositionSnapshot | null>(),
	},
	(table) => [index("question_round_idx").on(table.roundId)],
);

export const answer = pgTable(
	"answer",
	{
		id: text("id").primaryKey(),
		questionId: text("questionId").notNull(),
		answeringPlayerId: text("answeringPlayerId").notNull(),
		value: jsonb("value").$type<AnswerValue>().notNull(),
		answerPosition: jsonb("answerPosition").$type<PositionSnapshot | null>(),
		/** Answering device's clock — display only. */
		clientSubmittedAt: epochMs("clientSubmittedAt").notNull(),
		/** Monotonic elapsed on that device — displayed, never enforced. */
		answeredAfterMs: integer("answeredAfterMs").notNull(),
		/** When everyone else learned about it. */
		serverReceivedAt: epochMs("serverReceivedAt").notNull(),
	},
	(table) => [
		/**
		 * Not a data-integrity nicety — this index *is* first-to-the-server-wins.
		 * m0-spec §7.
		 */
		uniqueIndex("answer_question_idx").on(table.questionId),
	],
);

export const constraint = pgTable(
	"constraint",
	{
		id: text("id").primaryKey(),
		/** Constraints die with the round that produced them. */
		roundId: text("roundId").notNull(),
		/** Scope is a pair: seeker teams play against each other and do not share deductions. */
		seekerTeamId: text("seekerTeamId").notNull(),
		hiderTeamId: text("hiderTeamId").notNull(),
		source: text("source").$type<ConstraintSource>().notNull(),
		/** Set iff source === 'answer'. */
		answerId: text("answerId"),
		geometry: jsonb("geometry").$type<ConstraintGeometry>().notNull(),
		mode: text("mode").$type<ConstraintMode>().notNull(),
		/**
		 * Disabling is a column, not a deletion. Toggling one off, a hider
		 * correcting an answer, and the bulk "we are searching this zone now"
		 * invalidation are all writes here — one operation, not three features.
		 */
		enabled: boolean("enabled").notNull().default(true),
		ordinal: integer("ordinal").notNull(),
		createdAt: epochMs("createdAt").notNull(),
	},
	(table) => [
		index("constraint_scope_idx").on(
			table.roundId,
			table.seekerTeamId,
			table.hiderTeamId,
		),
	],
);

/**
 * The durable position log — not the same thing as presence. Presence is lossy
 * on purpose; this is queued locally and flushed on reconnect, so ten minutes
 * in a tunnel become ten minutes of track. m0-spec §8.
 */
export const positionSnapshot = pgTable(
	"positionSnapshot",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		roundId: text("roundId"),
		playerId: text("playerId").notNull(),
		teamId: text("teamId").notNull(),
		fix: jsonb("fix").$type<ClientFix>().notNull(),
		/**
		 * Lifted out of `fix` so the log can be ordered and indexed by it. This is
		 * the sender's own clock, and it is what replay renders from — a batch
		 * flushed on reconnect must not all claim to have happened at the instant
		 * the signal came back.
		 */
		capturedAt: epochMs("capturedAt").notNull(),
		receivedAt: epochMs("receivedAt"),
		reason: text("reason").$type<PositionReason>().notNull(),
	},
	(table) => [
		index("positionSnapshot_game_captured_idx").on(
			table.gameId,
			table.capturedAt,
		),
		index("positionSnapshot_player_idx").on(table.playerId),
	],
);

/**
 * Every mutator writes the state rows the UI queries *and* an event row, in one
 * transaction. There is no exception, and a state write with no event is a
 * defect. m0-spec §6.
 */
export const event = pgTable(
	"event",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		/** Server-assigned, monotonic per game. Ordering is always this, never a clock. */
		seq: integer("seq").notNull(),
		type: text("type").$type<EventType>().notNull(),
		/** Per-type schema version. Adding a field is compatible; changing one is a bump. */
		version: integer("version").notNull().default(1),
		actorPlayerId: text("actorPlayerId"),
		actorTeamId: text("actorTeamId"),
		payload: jsonb("payload").$type<Json>().notNull(),
		clientSubmittedAt: epochMs("clientSubmittedAt"),
		serverReceivedAt: epochMs("serverReceivedAt").notNull(),
	},
	(table) => [uniqueIndex("event_game_seq_idx").on(table.gameId, table.seq)],
);

export const drizzleSchema = {
	game,
	mapConfig,
	player,
	team,
	teamMember,
	round,
	roundTeamRole,
	hidingCommitment,
	question,
	answer,
	constraint,
	positionSnapshot,
	event,
};
