import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	doublePrecision,
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
	ScalePreset,
	Selection,
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
	/** Which catalog artifact `mapStop` was materialised from. m4-spec §7. */
	catalogVersion: text("catalogVersion").notNull(),
	name: text("name").notNull(),
	/** M6 reads this and never recomputes it. m4-spec §6. */
	scalePreset: text("scalePreset").$type<ScalePreset>().notNull(),
	/** The host's own vertices, so the builder can be reopened. m4-spec §3. */
	selection: jsonb("selection").$type<Selection>().notNull(),
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
	/**
	 * One number doing two jobs: it sizes a committed hiding zone and it decides
	 * whether a spot is near enough to a station. In the game they are one
	 * thing. Per-mode radii return with the toggles in M18. m4-spec §3.
	 */
	hidingRadiusMeters: doublePrecision("hidingRadiusMeters").notNull(),
	sourceTemplateId: text("sourceTemplateId"),
	/** m4-spec §8: a map change is a new row, never an update in place. */
	supersedesConfigId: text("supersedesConfigId"),
	contentHash: text("contentHash").notNull(),
});

/**
 * The stops a game carries, copied off the catalog at apply time so a playing
 * phone never queries it. m4-spec §5.
 *
 * Copied rather than referenced on purpose: the feed's stop ids are integers
 * assigned by gtfs.de and nothing promises they survive a rebuild, so a catalog
 * that renumbers every station in Germany cannot damage a map already in play.
 */
export const mapStop = pgTable(
	"mapStop",
	{
		/** `${mapConfigId}:${stopId}` — stable, and unique without a composite key. */
		id: text("id").primaryKey(),
		mapConfigId: text("mapConfigId").notNull(),
		/** The catalog's id, kept for provenance and re-editing. */
		stopId: text("stopId").notNull(),
		name: text("name").notNull(),
		lng: doublePrecision("lng").notNull(),
		lat: doublePrecision("lat").notNull(),
		modeIds: jsonb("modeIds").$type<string[]>().notNull(),
		/**
		 * Named lines that call here (`U8`, `S1`, `100`, …), distinct by
		 * `(name, modeId)`. Empty on maps materialised before this column
		 * existed, until the host re-applies. Shown on tap, not on the map.
		 */
		lines: jsonb("lines")
			.$type<{ name: string; modeId: string }[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		/**
		 * Inside the polygon, rather than merely inside the materialisation
		 * margin. Recorded because the readout wants an honest count and M5's
		 * station picker wants to sort by it — never because anything is
		 * forbidden outside. m4-spec §5.
		 */
		insideArea: boolean("insideArea").notNull(),
	},
	(table) => [index("mapStop_config_idx").on(table.mapConfigId)],
);

/**
 * A map that belongs to no game. m4-spec §7.
 *
 * Immutable: saving writes a row and never updates one, so a code you gave
 * somebody cannot change under them. Renaming or editing produces a new row
 * with a new code, which is why "duplicate" is not a feature — it is opening a
 * template in the builder and saving.
 *
 * Carries no stops. They rematerialise at apply time from the pinned catalog
 * version, which keeps a template a few kilobytes and makes byte-identity on
 * another device hold by construction rather than by luck.
 */
export const mapTemplate = pgTable(
	"mapTemplate",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		createdByPlayerId: text("createdByPlayerId").notNull(),
		createdAt: epochMs("createdAt").notNull(),
		catalogVersion: text("catalogVersion").notNull(),
		scalePreset: text("scalePreset").$type<ScalePreset>().notNull(),
		selection: jsonb("selection").$type<Selection>().notNull(),
		hidingRadiusMeters: doublePrecision("hidingRadiusMeters").notNull(),
		validHidingArea: jsonb("validHidingArea")
			.$type<StoredMultiPolygon>()
			.notNull(),
		contentHash: text("contentHash").notNull(),
	},
	(table) => [uniqueIndex("mapTemplate_code_idx").on(table.code)],
);

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

/** One host-authored rules document per game. */
export const houseRules = pgTable("houseRules", {
	gameId: text("gameId").primaryKey(),
	text: text("text").notNull(),
	updatedAt: epochMs("updatedAt").notNull(),
	updatedByPlayerId: text("updatedByPlayerId").notNull(),
});

/** Pause is a second axis beside round status, represented as intervals. */
export const roundPause = pgTable(
	"roundPause",
	{
		id: text("id").primaryKey(),
		roundId: text("roundId").notNull(),
		startedAt: epochMs("startedAt").notNull(),
		endedAt: epochMs("endedAt"),
		reason: text("reason").notNull(),
		startedByPlayerId: text("startedByPlayerId").notNull(),
		endedByPlayerId: text("endedByPlayerId"),
	},
	(table) => [index("roundPause_round_idx").on(table.roundId)],
);

/** The complete result has one row for every hider team, including survivors. */
export const hiderOutcome = pgTable(
	"hiderOutcome",
	{
		id: text("id").primaryKey(),
		roundId: text("roundId").notNull(),
		hiderTeamId: text("hiderTeamId").notNull(),
		seekerTeamId: text("seekerTeamId"),
		foundAt: epochMs("foundAt"),
		durationMillis: epochMs("durationMillis"),
		photoId: text("photoId"),
		markedByPlayerId: text("markedByPlayerId"),
		markedAt: epochMs("markedAt"),
	},
	(table) => [
		uniqueIndex("hiderOutcome_round_team_idx").on(
			table.roundId,
			table.hiderTeamId,
		),
	],
);

/** Photo metadata only; the bytes live outside Postgres. */
export const photo = pgTable("photo", {
	id: text("id").primaryKey(),
	gameId: text("gameId").notNull(),
	sha256: text("sha256").notNull(),
	contentType: text("contentType").notNull(),
	byteSize: integer("byteSize").notNull(),
	width: integer("width").notNull(),
	height: integer("height").notNull(),
	uploadedByPlayerId: text("uploadedByPlayerId").notNull(),
	uploadedAt: epochMs("uploadedAt").notNull(),
});

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
		 * A seeker-typed label so the list is not three identical
		 * "polygon · include" rows. Answer-derived constraints start unnamed;
		 * empty is stored as null, not "".
		 */
		name: text("name"),
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
 * Team-authored map notes live for the game. `roundId` records when a pin was
 * dropped for replay, but does not limit its lifetime or visibility. m3-spec §2.
 */
export const pin = pgTable(
	"pin",
	{
		id: text("id").primaryKey(),
		gameId: text("gameId").notNull(),
		teamId: text("teamId").notNull(),
		roundId: text("roundId"),
		createdByPlayerId: text("createdByPlayerId").notNull(),
		lng: doublePrecision("lng").notNull(),
		lat: doublePrecision("lat").notNull(),
		radiusMeters: doublePrecision("radiusMeters"),
		label: text("label").notNull(),
		note: text("note").notNull(),
		color: text("color").notNull(),
		createdAt: epochMs("createdAt").notNull(),
		updatedAt: epochMs("updatedAt").notNull(),
	},
	(table) => [index("pin_team_idx").on(table.gameId, table.teamId)],
);

/**
 * A seeker team's current intended search area. The unique index is the
 * one-zone-per-team-per-round rule; declaration replaces rather than appends.
 */
export const searchZone = pgTable(
	"searchZone",
	{
		id: text("id").primaryKey(),
		roundId: text("roundId").notNull(),
		seekerTeamId: text("seekerTeamId").notNull(),
		stopId: text("stopId"),
		lng: doublePrecision("lng").notNull(),
		lat: doublePrecision("lat").notNull(),
		radiusMeters: doublePrecision("radiusMeters").notNull(),
		note: text("note").notNull(),
		declaredByPlayerId: text("declaredByPlayerId").notNull(),
		declaredAt: epochMs("declaredAt").notNull(),
	},
	(table) => [
		uniqueIndex("searchZone_round_team_idx").on(
			table.roundId,
			table.seekerTeamId,
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
	mapStop,
	mapTemplate,
	player,
	team,
	teamMember,
	round,
	roundTeamRole,
	houseRules,
	roundPause,
	hiderOutcome,
	photo,
	hidingCommitment,
	question,
	answer,
	constraint,
	pin,
	searchZone,
	positionSnapshot,
	event,
};
