import type { LngLat, MultiPolygon } from "@zero-lag/geo";
import type {
	AnswerValue,
	ConstraintGeometry,
	QuestionShape,
} from "@zero-lag/rules";

export type {
	AnswerValue,
	ConstraintGeometry,
	LngLat,
	MultiPolygon,
	QuestionShape,
};

// --- identity ---------------------------------------------------------------

/** uuid v4, generated client-side, persisted in localStorage. */
export type DeviceId = string;
/** uuid v4, server-assigned at join. */
export type PlayerId = string;

/**
 * Carries identity only. Role is deliberately absent: hiders and seekers swap
 * between rounds, so role belongs to the round and is resolved by joining
 * `player → teamMember → team → roundTeamRole`. A player switching teams in the
 * lobby takes effect on the next query, with no token churn and no window where
 * a stale claim is still honoured. m0-spec §4.
 */
export type GameToken = {
	readonly sub: PlayerId;
	readonly gameId: string;
	readonly deviceId: DeviceId;
	readonly iat: number;
	readonly exp: number;
};

/** What a query or mutator learns about its caller. Never client-supplied. */
export type GameContext = {
	readonly playerId: PlayerId;
	readonly gameId: string;
	readonly deviceId: DeviceId;
};

// --- position ---------------------------------------------------------------

export type PositionSource = "gps" | "network" | "manual" | "unavailable";

/**
 * `source: 'unavailable'` is a first-class value — a hider with location
 * services off must be able to answer, and the record should say plainly that
 * there was no fix rather than omit the field. m0-spec §5.
 */
export type ClientFix = {
	readonly lng: number;
	readonly lat: number;
	readonly accuracyMeters: number;
	readonly headingDeg: number | null;
	readonly speedMps: number | null;
	/** The sender's own clock — trusted, and the staleness reference. */
	readonly capturedAt: number;
	readonly source: PositionSource;
};

export type PositionSnapshot = ClientFix & {
	/** Server clock, for diagnostics only; null inside a mutation. */
	readonly receivedAt: number | null;
};

export function fixToLngLat(fix: ClientFix): LngLat | null {
	return fix.source === "unavailable" ? null : [fix.lng, fix.lat];
}

export type BatteryState = {
	readonly level: number | null;
	readonly charging: boolean | null;
};

// --- conflict ---------------------------------------------------------------

/**
 * What comes back to the losing client. m0-spec §7.
 *
 * A discard is not an event: it reaches one client and nothing else. It is not
 * in the log, does not replay, and no other player ever learns it happened.
 */
export type MutationRejection =
	| {
			readonly code: "team_action_superseded";
			readonly questionId: string;
			/**
			 * Absent when the unique index caught the race rather than the mutator's
			 * own read: by then the transaction is aborted and nothing further can be
			 * read from it. The losing client names the winner from synced state
			 * anyway, so this is a convenience rather than a contract.
			 */
			readonly acceptedBy?: {
				readonly playerId: string;
				readonly displayName: string;
			};
			readonly acceptedAt?: number;
	  }
	| { readonly code: "not_permitted"; readonly reason: string }
	| {
			readonly code: "game_state_invalid";
			readonly expected: string;
			readonly actual: string;
	  };

export class MutationRejectedError extends Error {
	readonly rejection: MutationRejection;

	constructor(rejection: MutationRejection) {
		super(rejection.code);
		this.name = "MutationRejectedError";
		this.rejection = rejection;
	}
}

// --- the event log ----------------------------------------------------------

/** m0-spec §6. Adding a type is compatible; changing one's meaning is a version bump. */
export const EVENT_TYPES = [
	"game.created",
	"game.stateChanged",
	/**
	 * Host is a hat rather than a rank: any player can claim or release it and
	 * more than one can wear it, so there is nothing to transfer. m1-spec §6.
	 * This replaces `host.transferred`, which M0 declared and never emitted —
	 * so no version bump is owed to anyone.
	 */
	"host.changed",
	"player.joined",
	"player.renamed",
	"player.left",
	"player.removed",
	"team.created",
	"team.updated",
	"team.deleted",
	"team.memberJoined",
	"team.memberLeft",
	"round.created",
	"round.rolesAssigned",
	"round.hidingStarted",
	"round.seekingStarted",
	"round.ended",
	"round.zoneCommitted",
	"question.asked",
	"question.answered",
	"question.cancelled",
	"constraint.created",
	"constraint.enabledChanged",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type GameStatus = "draft" | "lobby" | "running" | "finished";

/**
 * `pending` is a round that exists but has not begun. Round 1 is created with
 * the game so the lobby has somewhere to assign roles, which is what keeps role
 * a property of a round rather than of a team. m1-spec §3.
 *
 * A role existing is not the same as a round running: anything that lets a team
 * *act* on its role gates on `hiding | seeking`, never on "a role is set".
 */
export type RoundStatus = "pending" | "hiding" | "seeking" | "ended";
export type TeamRole = "seeker" | "hider";
export type QuestionType = "radar";
export type QuestionStatus = "started" | "pending" | "answered" | "cancelled";
export type ConstraintSource = "answer" | "manual";
export type ConstraintMode = "include" | "exclude";

/** Why a position was written to the durable log rather than only broadcast. */
export type PositionReason =
	| "interval"
	| "question.asked"
	| "question.ended"
	| "question.answered";

export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [key: string]: Json };

// --- map config -------------------------------------------------------------

export type StoredProjection = {
	readonly proj4: string;
	readonly snapPrecisionMeters: number;
	readonly simplifyToleranceMeters: number;
};

export type StoredHidingRadii = Readonly<Record<string, number>>;

export type StoredMultiPolygon = MultiPolygon;
