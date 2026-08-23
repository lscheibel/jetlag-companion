import {
	boolean,
	createBuilder,
	createSchema,
	enumeration,
	json,
	number,
	relationships,
	string,
	table,
} from "@rocicorp/zero";
import type {
	AnswerValue,
	ClientFix,
	ConstraintGeometry,
	ConstraintMode,
	ConstraintSource,
	EventType,
	GameContext,
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
 * Derived by hand from the Drizzle schema in ../drizzle/index.ts, which owns
 * the DDL. `schema.test.ts` walks both and fails if they drift — a generator
 * would keep them in step, but it could not give `json()` columns their real
 * types, and untyped geometry is exactly the thing this codebase cannot afford.
 */

const game = table("game")
	.columns({
		id: string(),
		code: string(),
		status: enumeration<GameStatus>(),
		createdByPlayerId: string(),
		mapConfigId: string().optional(),
		eventSeq: number(),
		positionIntervalMs: number(),
		createdAt: number(),
		startedAt: number().optional(),
		endedAt: number().optional(),
	})
	.primaryKey("id");

const mapConfig = table("mapConfig")
	.columns({
		id: string(),
		gameId: string(),
		catalogVersion: string(),
		name: string(),
		scalePreset: enumeration<ScalePreset>(),
		selection: json<Selection>(),
		validHidingArea: json<StoredMultiPolygon>(),
		hidingRadiusMeters: number(),
		sourceTemplateId: string().optional(),
		supersedesConfigId: string().optional(),
		contentHash: string(),
	})
	.primaryKey("id");

/**
 * `mapTemplate` is deliberately absent: a template belongs to no game, and
 * Zero's query context is a game. It is read over plain HTTP, and
 * `schema.test.ts` names it as the one table allowed to be Drizzle-only.
 * m4-spec §7.
 */
const mapStop = table("mapStop")
	.columns({
		id: string(),
		mapConfigId: string(),
		stopId: string(),
		name: string(),
		lng: number(),
		lat: number(),
		modeIds: json<string[]>(),
		insideArea: boolean(),
	})
	.primaryKey("id");

const player = table("player")
	.columns({
		id: string(),
		gameId: string(),
		displayName: string(),
		deviceId: string(),
		joinedAt: number(),
		isHost: boolean(),
		leftAt: number().optional(),
		removedByPlayerId: string().optional(),
	})
	.primaryKey("id");

const team = table("team")
	.columns({
		id: string(),
		gameId: string(),
		name: string(),
		color: string(),
		emoji: string(),
		createdAt: number(),
	})
	.primaryKey("id");

const teamMember = table("teamMember")
	.columns({
		teamId: string(),
		playerId: string(),
		joinedAt: number(),
	})
	.primaryKey("teamId", "playerId");

const round = table("round")
	.columns({
		id: string(),
		gameId: string(),
		ordinal: number(),
		status: enumeration<RoundStatus>(),
		hidingDurationMs: number(),
		hidingStartedAt: number().optional(),
		seekingStartedAt: number().optional(),
		endedAt: number().optional(),
	})
	.primaryKey("id");

const roundTeamRole = table("roundTeamRole")
	.columns({
		roundId: string(),
		teamId: string(),
		role: enumeration<TeamRole>(),
	})
	.primaryKey("roundId", "teamId");

const houseRules = table("houseRules")
	.columns({
		gameId: string(),
		text: string(),
		updatedAt: number(),
		updatedByPlayerId: string(),
	})
	.primaryKey("gameId");

const roundPause = table("roundPause")
	.columns({
		id: string(),
		roundId: string(),
		startedAt: number(),
		endedAt: number().optional(),
		reason: string(),
		startedByPlayerId: string(),
		endedByPlayerId: string().optional(),
	})
	.primaryKey("id");

const hiderOutcome = table("hiderOutcome")
	.columns({
		id: string(),
		roundId: string(),
		hiderTeamId: string(),
		seekerTeamId: string().optional(),
		foundAt: number().optional(),
		durationMillis: number().optional(),
		photoId: string().optional(),
		markedByPlayerId: string().optional(),
		markedAt: number().optional(),
	})
	.primaryKey("id");

const photo = table("photo")
	.columns({
		id: string(),
		gameId: string(),
		sha256: string(),
		contentType: string(),
		byteSize: number(),
		width: number(),
		height: number(),
		uploadedByPlayerId: string(),
		uploadedAt: number(),
	})
	.primaryKey("id");

const hidingCommitment = table("hidingCommitment")
	.columns({
		id: string(),
		roundId: string(),
		hiderTeamId: string(),
		stopId: string(),
		zone: json<StoredMultiPolygon>(),
		committedAt: number(),
		declaredSpot: json<[number, number] | null>().optional(),
	})
	.primaryKey("id");

const question = table("question")
	.columns({
		id: string(),
		roundId: string(),
		askingTeamId: string(),
		targetTeamId: string(),
		type: enumeration<QuestionType>(),
		params: json<Json>(),
		status: enumeration<QuestionStatus>(),
		askedAt: number(),
		askPosition: json<PositionSnapshot | null>().optional(),
		endedAt: number().optional(),
		endPosition: json<PositionSnapshot | null>().optional(),
	})
	.primaryKey("id");

const answer = table("answer")
	.columns({
		id: string(),
		questionId: string(),
		answeringPlayerId: string(),
		value: json<AnswerValue>(),
		answerPosition: json<PositionSnapshot | null>().optional(),
		clientSubmittedAt: number(),
		answeredAfterMs: number(),
		serverReceivedAt: number(),
	})
	.primaryKey("id");

const constraint = table("constraint")
	.columns({
		id: string(),
		roundId: string(),
		seekerTeamId: string(),
		hiderTeamId: string(),
		source: enumeration<ConstraintSource>(),
		answerId: string().optional(),
		geometry: json<ConstraintGeometry>(),
		mode: enumeration<ConstraintMode>(),
		name: string().optional(),
		enabled: boolean(),
		ordinal: number(),
		createdAt: number(),
	})
	.primaryKey("id");

const pin = table("pin")
	.columns({
		id: string(),
		gameId: string(),
		teamId: string(),
		roundId: string().optional(),
		createdByPlayerId: string(),
		lng: number(),
		lat: number(),
		radiusMeters: number().optional(),
		label: string(),
		note: string(),
		color: string(),
		createdAt: number(),
		updatedAt: number(),
	})
	.primaryKey("id");

const searchZone = table("searchZone")
	.columns({
		id: string(),
		roundId: string(),
		seekerTeamId: string(),
		stopId: string().optional(),
		lng: number(),
		lat: number(),
		radiusMeters: number(),
		note: string(),
		declaredByPlayerId: string(),
		declaredAt: number(),
	})
	.primaryKey("id");

const positionSnapshot = table("positionSnapshot")
	.columns({
		id: string(),
		gameId: string(),
		roundId: string().optional(),
		playerId: string(),
		teamId: string(),
		fix: json<ClientFix>(),
		capturedAt: number(),
		receivedAt: number().optional(),
		reason: enumeration<PositionReason>(),
	})
	.primaryKey("id");

const event = table("event")
	.columns({
		id: string(),
		gameId: string(),
		seq: number(),
		type: enumeration<EventType>(),
		version: number(),
		actorPlayerId: string().optional(),
		actorTeamId: string().optional(),
		payload: json<Json>(),
		clientSubmittedAt: number().optional(),
		serverReceivedAt: number(),
	})
	.primaryKey("id");

const gameRelationships = relationships(game, ({ many, one }) => ({
	players: many({
		sourceField: ["id"],
		destField: ["gameId"],
		destSchema: player,
	}),
	teams: many({ sourceField: ["id"], destField: ["gameId"], destSchema: team }),
	rounds: many({
		sourceField: ["id"],
		destField: ["gameId"],
		destSchema: round,
	}),
	houseRules: one({
		sourceField: ["id"],
		destField: ["gameId"],
		destSchema: houseRules,
	}),
	photos: many({
		sourceField: ["id"],
		destField: ["gameId"],
		destSchema: photo,
	}),
	pins: many({ sourceField: ["id"], destField: ["gameId"], destSchema: pin }),
	mapConfig: one({
		sourceField: ["mapConfigId"],
		destField: ["id"],
		destSchema: mapConfig,
	}),
}));

const mapConfigRelationships = relationships(mapConfig, ({ many }) => ({
	stops: many({
		sourceField: ["id"],
		destField: ["mapConfigId"],
		destSchema: mapStop,
	}),
}));

const mapStopRelationships = relationships(mapStop, ({ one }) => ({
	config: one({
		sourceField: ["mapConfigId"],
		destField: ["id"],
		destSchema: mapConfig,
	}),
	/**
	 * The game this stop's config is *currently* the board for.
	 *
	 * Not the same as `config.game`: §8 keeps superseded configs and their rows
	 * so a replay can reconstruct which board was in force when, and a phone
	 * playing now wants only the board in force now. Joining on `mapConfigId` in
	 * both directions is what says "current" without a flag column to keep true.
	 */
	currentGame: one({
		sourceField: ["mapConfigId"],
		destField: ["mapConfigId"],
		destSchema: game,
	}),
}));

const teamRelationships = relationships(team, ({ many }) => ({
	members: many({
		sourceField: ["id"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
	roles: many({
		sourceField: ["id"],
		destField: ["teamId"],
		destSchema: roundTeamRole,
	}),
	pins: many({ sourceField: ["id"], destField: ["teamId"], destSchema: pin }),
	searchZones: many({
		sourceField: ["id"],
		destField: ["seekerTeamId"],
		destSchema: searchZone,
	}),
}));

const teamMemberRelationships = relationships(teamMember, ({ one }) => ({
	player: one({
		sourceField: ["playerId"],
		destField: ["id"],
		destSchema: player,
	}),
	team: one({ sourceField: ["teamId"], destField: ["id"], destSchema: team }),
}));

const roundRelationships = relationships(round, ({ many }) => ({
	roles: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: roundTeamRole,
	}),
	questions: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: question,
	}),
	commitments: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: hidingCommitment,
	}),
	constraints: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: constraint,
	}),
	pins: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: pin,
	}),
	searchZones: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: searchZone,
	}),
	pauses: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: roundPause,
	}),
	outcomes: many({
		sourceField: ["id"],
		destField: ["roundId"],
		destSchema: hiderOutcome,
	}),
}));

const roundTeamRoleRelationships = relationships(roundTeamRole, ({ many }) => ({
	teamMembers: many({
		sourceField: ["teamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
}));

const houseRulesRelationships = relationships(houseRules, ({ one }) => ({
	game: one({
		sourceField: ["gameId"],
		destField: ["id"],
		destSchema: game,
	}),
}));

const roundPauseRelationships = relationships(roundPause, ({ one }) => ({
	round: one({
		sourceField: ["roundId"],
		destField: ["id"],
		destSchema: round,
	}),
}));

const hiderOutcomeRelationships = relationships(hiderOutcome, ({ one }) => ({
	round: one({
		sourceField: ["roundId"],
		destField: ["id"],
		destSchema: round,
	}),
	photo: one({
		sourceField: ["photoId"],
		destField: ["id"],
		destSchema: photo,
	}),
}));

const photoRelationships = relationships(photo, ({ one }) => ({
	game: one({
		sourceField: ["gameId"],
		destField: ["id"],
		destSchema: game,
	}),
}));

const questionRelationships = relationships(question, ({ many, one }) => ({
	// One answer at most — the UNIQUE index in §7 guarantees it — but the
	// relationship is `many` because Zero models the foreign side, and a
	// question with no answer yet is the normal case.
	answers: many({
		sourceField: ["id"],
		destField: ["questionId"],
		destSchema: answer,
	}),
	round: one({
		sourceField: ["roundId"],
		destField: ["id"],
		destSchema: round,
	}),
	askingTeamMembers: many({
		sourceField: ["askingTeamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
	targetTeamMembers: many({
		sourceField: ["targetTeamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
}));

const constraintRelationships = relationships(constraint, ({ many }) => ({
	seekerTeamMembers: many({
		sourceField: ["seekerTeamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
}));

const pinRelationships = relationships(pin, ({ many, one }) => ({
	teamMembers: many({
		sourceField: ["teamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
	round: one({
		sourceField: ["roundId"],
		destField: ["id"],
		destSchema: round,
	}),
}));

const searchZoneRelationships = relationships(searchZone, ({ many, one }) => ({
	seekerTeamMembers: many({
		sourceField: ["seekerTeamId"],
		destField: ["teamId"],
		destSchema: teamMember,
	}),
	round: one({
		sourceField: ["roundId"],
		destField: ["id"],
		destSchema: round,
	}),
}));

const hidingCommitmentRelationships = relationships(
	hidingCommitment,
	({ many, one }) => ({
		hiderTeamMembers: many({
			sourceField: ["hiderTeamId"],
			destField: ["teamId"],
			destSchema: teamMember,
		}),
		round: one({
			sourceField: ["roundId"],
			destField: ["id"],
			destSchema: round,
		}),
	}),
);

const positionSnapshotRelationships = relationships(
	positionSnapshot,
	({ many }) => ({
		teamMembers: many({
			sourceField: ["teamId"],
			destField: ["teamId"],
			destSchema: teamMember,
		}),
	}),
);

export const schema = createSchema({
	tables: [
		game,
		mapConfig,
		mapStop,
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
	],
	relationships: [
		gameRelationships,
		mapConfigRelationships,
		mapStopRelationships,
		teamRelationships,
		teamMemberRelationships,
		roundRelationships,
		roundTeamRoleRelationships,
		houseRulesRelationships,
		roundPauseRelationships,
		hiderOutcomeRelationships,
		photoRelationships,
		questionRelationships,
		constraintRelationships,
		pinRelationships,
		searchZoneRelationships,
		hidingCommitmentRelationships,
		positionSnapshotRelationships,
	],
});

export const zql = createBuilder(schema);

export type Schema = typeof schema;

declare module "@rocicorp/zero" {
	interface DefaultTypes {
		schema: typeof schema;
		context: GameContext | undefined;
	}
}
