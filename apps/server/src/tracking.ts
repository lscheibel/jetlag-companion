import { createHash, randomBytes } from "node:crypto";
import type { ClientFix, PositionSnapshot, TeamRole } from "@zero-lag/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, drizzleSchema } from "./db";
import { applyExternalFix } from "./presence";
import type { ParsedPing } from "./tracking-protocol";

/**
 * External position tracking. m15-spec §3–§6.
 *
 * Browser geolocation stops when the screen locks, and a hider whose phone is
 * in their pocket is exactly the player everyone else most wants on the map. The
 * build plan's answer to that was a Capacitor build; this is the cheaper half of
 * it, and it works today on both platforms: a player points a tracker app they
 * already trust — OsmAnd, OwnTracks, Traccar Client, GPSLogger — at one URL, and
 * that app reports their position whether or not this one is running.
 *
 * It is strictly additional. The web page keeps its own watch, keeps writing its
 * own log, and a player who sets none of this up loses nothing they had.
 *
 * This file is the delivery half: tokens, and turning a parsed ping into rows
 * and broadcasts. The wire formats themselves are in `tracking-protocol.ts`.
 */

/** Games a ping is worth delivering to. A finished game wants no more positions. */
const LIVE_GAME_STATUSES = ["draft", "lobby", "running"] as const;

/** Rounds whose positions belong in the durable log. m2-spec §10, unamended. */
const LOGGING_ROUND_STATUSES = ["hiding", "seeking"] as const;

export type TrackingIdentity = {
	readonly token: string;
	readonly createdAt: number;
	readonly lastSeenAt: number | null;
};

/**
 * Mint a device's tracking token, retiring whatever it had.
 *
 * Revoked rows are kept rather than deleted so that a tracker app still pointed
 * at an old URL can be told it was turned off — a different problem from a URL
 * that was never valid, with a different fix.
 */
export async function issueTrackingToken(
	deviceId: string,
): Promise<TrackingIdentity> {
	const now = Date.now();
	const token = randomBytes(24).toString("base64url");

	await db.transaction(async (tx) => {
		await tx
			.update(drizzleSchema.trackingToken)
			.set({ revokedAt: now })
			.where(
				and(
					eq(drizzleSchema.trackingToken.deviceId, deviceId),
					isNull(drizzleSchema.trackingToken.revokedAt),
				),
			);
		await tx.insert(drizzleSchema.trackingToken).values({
			token,
			deviceId,
			createdAt: now,
			revokedAt: null,
			lastSeenAt: null,
		});
	});

	return { token, createdAt: now, lastSeenAt: null };
}

export async function activeTrackingToken(
	deviceId: string,
): Promise<TrackingIdentity | null> {
	const [row] = await db
		.select({
			token: drizzleSchema.trackingToken.token,
			createdAt: drizzleSchema.trackingToken.createdAt,
			lastSeenAt: drizzleSchema.trackingToken.lastSeenAt,
		})
		.from(drizzleSchema.trackingToken)
		.where(
			and(
				eq(drizzleSchema.trackingToken.deviceId, deviceId),
				isNull(drizzleSchema.trackingToken.revokedAt),
			),
		)
		.orderBy(desc(drizzleSchema.trackingToken.createdAt))
		.limit(1);

	return row ?? null;
}

export async function revokeTrackingToken(deviceId: string): Promise<void> {
	await db
		.update(drizzleSchema.trackingToken)
		.set({ revokedAt: Date.now() })
		.where(
			and(
				eq(drizzleSchema.trackingToken.deviceId, deviceId),
				isNull(drizzleSchema.trackingToken.revokedAt),
			),
		);
}

export type IngestResult =
	| { readonly ok: true; readonly games: number }
	| { readonly ok: false; readonly reason: "unknown_token" | "revoked" };

/**
 * One ping, delivered to every live game the reporting device is playing in.
 *
 * There is no "which game did this mean" question to answer: a phone is in one
 * place, and that fact is equally true of every game it is currently part of.
 * Nearly always that is exactly one game; occasionally, during a handover
 * between sessions, it is two, and writing to both is correct rather than a
 * compromise.
 */
export async function ingestPing(
	token: string,
	pings: readonly ParsedPing[],
): Promise<IngestResult> {
	const [row] = await db
		.select({
			deviceId: drizzleSchema.trackingToken.deviceId,
			revokedAt: drizzleSchema.trackingToken.revokedAt,
		})
		.from(drizzleSchema.trackingToken)
		.where(eq(drizzleSchema.trackingToken.token, token))
		.limit(1);

	if (!row) return { ok: false, reason: "unknown_token" };
	if (row.revokedAt !== null) return { ok: false, reason: "revoked" };

	const receivedAt = Date.now();

	/**
	 * Stamped for any authenticated request, before anything is read out of it.
	 *
	 * Overland sends an empty batch when it has nothing new, and that is the app
	 * reaching us every bit as much as a point is. Recording it only alongside a
	 * position would leave a correctly configured tracker looking like one that
	 * had never been heard from — and the waiting screen, which exists for
	 * exactly the minute after setup, would sit on "no ping has arrived yet"
	 * while the pings arrived.
	 */
	await db
		.update(drizzleSchema.trackingToken)
		.set({ lastSeenAt: receivedAt })
		.where(eq(drizzleSchema.trackingToken.token, token));

	/**
	 * Oldest first, so the newest is last and therefore the one presence ends up
	 * holding. A batch arrives in whatever order the app kept it, and a live
	 * marker must not end up showing a point from the beginning of a tunnel.
	 */
	const ordered = [...pings].sort((a, b) => a.capturedAt - b.capturedAt);
	const newest = ordered.at(-1);
	if (!newest) return { ok: true, games: 0 };

	/**
	 * The one clock subtraction in the system that crosses a boundary, and it is
	 * forced. m0-spec §7, m15-spec §4.
	 *
	 * Every other age in the system is a sum of elapsed durations each measured
	 * on a single clock, because the capturing device can measure its own fix's
	 * age and send *that*. A tracker app cannot: the protocol carries an absolute
	 * timestamp and nothing else, so the only way to date it here is against this
	 * machine's clock. Clamped at zero, because a phone running fast would
	 * otherwise report a position from the future as fresher than fresh.
	 */
	const capturedAgeMs = Math.max(0, receivedAt - newest.capturedAt);

	const snapshotOf = (ping: ParsedPing): PositionSnapshot => ({
		lng: ping.lng,
		lat: ping.lat,
		accuracyMeters: ping.accuracyMeters,
		// Course over ground is not heading. m2-spec §8.
		headingDeg: null,
		speedMps: ping.speedMps,
		capturedAt: ping.capturedAt,
		source: "external",
		receivedAt,
	});

	const fix = snapshotOf(newest);

	const memberships = await db
		.select({
			gameId: drizzleSchema.player.gameId,
			playerId: drizzleSchema.player.id,
			displayName: drizzleSchema.player.displayName,
		})
		.from(drizzleSchema.player)
		.innerJoin(
			drizzleSchema.game,
			eq(drizzleSchema.game.id, drizzleSchema.player.gameId),
		)
		.where(
			and(
				eq(drizzleSchema.player.deviceId, row.deviceId),
				isNull(drizzleSchema.player.leftAt),
				inArray(drizzleSchema.game.status, [...LIVE_GAME_STATUSES]),
			),
		);

	for (const membership of memberships) {
		const { teamId, role, loggingRoundId } = await resolveStanding(
			membership.gameId,
			membership.playerId,
		);

		// Presence gets the newest point only. It holds one position per player by
		// construction, and replaying a batch through it would be ninety-nine
		// discarded writes and one that counted.
		applyExternalFix({
			gameId: membership.gameId,
			playerId: membership.playerId,
			displayName: membership.displayName,
			teamId,
			role,
			fix,
			capturedAgeMs,
		});

		/**
		 * The durable log follows the round exactly as the web path does — this is
		 * a second source for it, not a second policy. A team is required because
		 * `positionSnapshot.teamId` is not nullable and a position with no team is
		 * not a thing replay can draw.
		 */
		if (loggingRoundId && teamId) {
			// The log gets every point in the batch, because that is the trail —
			// but keyed by the point rather than by the delivery, so a retried
			// batch is not a second trail. Also covers a batch that repeats a point
			// within itself, which a stationary phone can send.
			await db
				.insert(drizzleSchema.positionSnapshot)
				.values(
					ordered.map((ping) => ({
						id: snapshotId(membership.playerId, ping),
						gameId: membership.gameId,
						roundId: loggingRoundId,
						playerId: membership.playerId,
						teamId,
						fix: snapshotOf(ping) satisfies ClientFix,
						capturedAt: ping.capturedAt,
						receivedAt,
						reason: "interval" as const,
					})),
				)
				.onConflictDoNothing();
		}
	}

	return { ok: true, games: memberships.length };
}

/**
 * A point's own name, so delivering it twice writes it once. m15-spec §4.
 *
 * Overland retries a batch until it is answered, which means a reply lost after
 * the insert committed brings the same two hundred points back — and a random
 * id would write that stretch of the trail twice and quietly double M14's
 * replay resolution for it. The web path never had this problem: its queue
 * mints an id per fix and the mutator upserts on it. A ping carries no id, so
 * one is derived from what makes it the point it is. `playerId` is per-game
 * already, so it scopes this without naming the game.
 */
function snapshotId(playerId: string, ping: ParsedPing): string {
	return createHash("sha256")
		.update(`${playerId}|${ping.capturedAt}|${ping.lat}|${ping.lng}`)
		.digest("hex")
		.slice(0, 32);
}

/**
 * Team, role, and the round this position should be logged against.
 *
 * Deliberately the same reading `resolveRole` does for a socket — team and role
 * from the highest non-ended round — with one addition: the log only wants a
 * round that has actually started, so `pending` yields a role but no log row.
 */
async function resolveStanding(
	gameId: string,
	playerId: string,
): Promise<{
	teamId: string | null;
	role: TeamRole | null;
	loggingRoundId: string | null;
}> {
	const [membership] = await db
		.select({ teamId: drizzleSchema.teamMember.teamId })
		.from(drizzleSchema.teamMember)
		.innerJoin(
			drizzleSchema.team,
			eq(drizzleSchema.team.id, drizzleSchema.teamMember.teamId),
		)
		.where(
			and(
				eq(drizzleSchema.teamMember.playerId, playerId),
				eq(drizzleSchema.team.gameId, gameId),
			),
		);

	const teamId = membership?.teamId ?? null;
	if (!teamId) return { teamId: null, role: null, loggingRoundId: null };

	const [round] = await db
		.select({
			id: drizzleSchema.round.id,
			status: drizzleSchema.round.status,
		})
		.from(drizzleSchema.round)
		.where(
			and(
				eq(drizzleSchema.round.gameId, gameId),
				inArray(drizzleSchema.round.status, ["pending", "hiding", "seeking"]),
			),
		)
		.orderBy(desc(drizzleSchema.round.ordinal))
		.limit(1);

	if (!round) return { teamId, role: null, loggingRoundId: null };

	const [assignment] = await db
		.select({ role: drizzleSchema.roundTeamRole.role })
		.from(drizzleSchema.roundTeamRole)
		.where(
			and(
				eq(drizzleSchema.roundTeamRole.roundId, round.id),
				eq(drizzleSchema.roundTeamRole.teamId, teamId),
			),
		);

	const logging = (LOGGING_ROUND_STATUSES as readonly string[]).includes(
		round.status,
	);

	return {
		teamId,
		role: assignment?.role ?? null,
		loggingRoundId: logging ? round.id : null,
	};
}
