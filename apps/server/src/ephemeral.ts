import type { Server } from "node:http";
import type { ClientFix, TeamRole } from "@zero-lag/schema";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { type WebSocket, WebSocketServer } from "ws";
import { verifyGameToken } from "./auth";
import { db, drizzleSchema } from "./db";
import {
	type Connection,
	closeRoomIfEmpty,
	isFresherFix,
	type PresenceEntry,
	ROLE_TTL_MS,
	type Room,
	roomAt,
	roomFor,
	stampAges,
	type TrackedEntry,
	visibleTo,
} from "./presence";

export type { PresenceEntry } from "./presence";

/**
 * The ephemeral channel. m0-spec §8.
 *
 * Everything here is lossy on purpose. A `pos` broadcast that cannot be
 * delivered right now is worthless in five seconds: it is dropped, never
 * queued, and the receiving client's stale marker greys out — which is the
 * honest outcome. The *durable* position log is a different thing entirely and
 * travels over Zero.
 *
 * This file is the socket half — the wire protocol, the fan-out, and the
 * database reads that decide who may see whom. The room it fans out is in
 * `presence.ts`.
 */

export type EphemeralUp =
	| { t: "hello"; token: string }
	| {
			t: "pos";
			fix: ClientFix;
			/**
			 * How old the fix already was when this frame left the device, measured
			 * on the device's own clock. m0-spec §7.
			 *
			 * Age travels as an elapsed duration rather than being derived here from
			 * `fix.capturedAt`, because that would subtract a phone's clock from this
			 * machine's. It also carries the part of a fix's age that `receivedAt`
			 * alone cannot see: GPS acquisition, the send throttle, and a queue that
			 * waited for signal.
			 */
			capturedAgeMs: number;
	  }
	| { t: "batt"; level: number | null; charging: boolean | null }
	| { t: "ping" };

export type EphemeralDown =
	| { t: "presence"; entries: PresenceEntry[] }
	| { t: "pong" }
	| { t: "clockDrift"; offsetMs: number }
	| {
			t: "bye";
			reason: "token_expired" | "game_ended" | "replaced" | "invalid";
	  };

/** Past this, a device's own clock is worth mentioning to its owner. And only to them. */
const CLOCK_DRIFT_THRESHOLD_MS = 120_000;

/**
 * Roles are re-read on the tick rather than only when something moved.
 *
 * Doing it inside the fan-out looks equivalent and is not: a game where nobody
 * is walking produces no fan-out, so a table that swapped roles between rounds
 * would keep the old filter until somebody happened to move.
 */
async function tick(gameId: string, room: Room): Promise<void> {
	let changed = false;
	const connected = new Set<string>();
	for (const connection of room.connections) {
		connected.add(connection.playerId);
		if (await refreshRole(connection)) changed = true;
	}
	// Tracker-only players have no socket, so `refreshRole` never sees them.
	// A table that swaps sides while a hider's phone is in a pocket would
	// otherwise keep serving their coordinates to their former seeker teammates.
	for (const entry of room.presence.values()) {
		if (connected.has(entry.playerId)) continue;
		if (await refreshOfflineRole(gameId, entry)) changed = true;
	}
	if (!room.dirty && !changed) {
		closeRoomIfEmpty(gameId, room);
		return;
	}
	room.dirty = false;

	const entries = stampAges(room.presence.values());
	for (const connection of room.connections) {
		send(connection.socket, {
			t: "presence",
			entries: visibleTo(connection, entries),
		});
	}
	closeRoomIfEmpty(gameId, room);
}

function send(socket: WebSocket, message: EphemeralDown): void {
	if (socket.readyState === socket.OPEN) {
		socket.send(JSON.stringify(message));
	}
}

/**
 * Role is resolved by `player → teamMember → team → roundTeamRole` for the
 * current round, never read from the token. A player switching teams in the
 * lobby, or a whole table swapping roles between rounds, takes effect on the
 * next read with no token churn. m0-spec §4.
 */
async function resolveRole(
	gameId: string,
	playerId: string,
): Promise<{ teamId: string | null; role: TeamRole | null }> {
	const memberships = await db
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

	const teamId = memberships[0]?.teamId ?? null;
	if (!teamId) return { teamId: null, role: null };

	/**
	 * `pending` counts. A lobby that has assigned roles has hiders and seekers in
	 * it, and §9's filter has no round-state precondition — so this must agree
	 * with `useMyRole`, which takes the highest-ordinal round that has not ended.
	 * Gating on "a round is running" belongs on the things a team can *do* with a
	 * role, not on who may see a position. m1-spec §3.
	 */
	const [round] = await db
		.select({ id: drizzleSchema.round.id })
		.from(drizzleSchema.round)
		.where(
			and(
				eq(drizzleSchema.round.gameId, gameId),
				inArray(drizzleSchema.round.status, ["pending", "hiding", "seeking"]),
			),
		)
		.orderBy(desc(drizzleSchema.round.ordinal))
		.limit(1);

	if (!round) return { teamId, role: null };

	const [assignment] = await db
		.select({ role: drizzleSchema.roundTeamRole.role })
		.from(drizzleSchema.roundTeamRole)
		.where(
			and(
				eq(drizzleSchema.roundTeamRole.roundId, round.id),
				eq(drizzleSchema.roundTeamRole.teamId, teamId),
			),
		)
		.limit(1);

	return { teamId, role: assignment?.role ?? null };
}

/** Returns whether anything about this connection's role actually moved. */
async function refreshRole(connection: Connection): Promise<boolean> {
	if (Date.now() - connection.roleReadAt < ROLE_TTL_MS) return false;
	const resolved = await resolveRole(connection.gameId, connection.playerId);
	const changed =
		connection.teamId !== resolved.teamId || connection.role !== resolved.role;

	connection.teamId = resolved.teamId;
	connection.role = resolved.role;
	connection.roleReadAt = Date.now();

	const entry = roomAt(connection.gameId)?.presence.get(connection.playerId);
	if (entry) {
		entry.teamId = resolved.teamId;
		entry.role = resolved.role;
		entry.roleReadAt = connection.roleReadAt;
	}
	return changed;
}

/** Same read as `refreshRole`, for a presence entry that has no socket. */
async function refreshOfflineRole(
	gameId: string,
	entry: TrackedEntry,
): Promise<boolean> {
	if (Date.now() - entry.roleReadAt < ROLE_TTL_MS) return false;
	const resolved = await resolveRole(gameId, entry.playerId);
	entry.roleReadAt = Date.now();
	if (entry.teamId === resolved.teamId && entry.role === resolved.role) {
		return false;
	}
	entry.teamId = resolved.teamId;
	entry.role = resolved.role;
	return true;
}

export function attachEphemeralChannel(server: Server, path: string): void {
	const wss = new WebSocketServer({ server, path });

	wss.on("connection", (socket) => {
		let connection: Connection | null = null;

		/**
		 * One socket's messages are handled one at a time, in the order they
		 * arrived.
		 *
		 * `handleMessage` awaits — `hello` in particular verifies a token and
		 * reads the database — and firing each one straight into the event loop
		 * lets a later message overtake an earlier one. What that costs is
		 * specific: a client that says `hello` and then immediately says where it
		 * is has its position dropped, because the `hello` has not finished
		 * registering the connection yet. A frame order the wire guarantees is
		 * not one this side gets to reorder.
		 */
		let queue: Promise<void> = Promise.resolve();
		socket.on("message", (raw) => {
			const text = raw.toString();
			queue = queue.then(() => handleMessage(text)).catch(() => {});
		});

		/**
		 * The socket goes; the entry stays. m2-spec §6.
		 *
		 * Its last known fix stays with it and keeps ageing, so a phone in a tunnel
		 * greys through the staleness buckets instead of disappearing. There is
		 * deliberately no expiry sweep: an entry is discarded when the room is —
		 * when the last connection leaves — and never before, because "where did we
		 * last see Ben" is worth more than the bytes it costs in a game of twenty.
		 */
		socket.on("close", () => {
			if (!connection) return;
			const room = roomAt(connection.gameId);
			if (!room) return;
			room.connections.delete(connection);

			const entry = room.presence.get(connection.playerId);
			// Guarded, because a second tab replaces the first: that close arrives
			// after the newcomer has already registered, and it must not mark a live
			// player offline.
			const replaced = [...room.connections].some(
				(other) => other.playerId === connection?.playerId,
			);
			if (entry && !replaced) {
				entry.online = false;
				entry.onlineSince = Date.now();
			}

			room.dirty = true;
			closeRoomIfEmpty(connection.gameId, room);
		});

		async function handleMessage(text: string): Promise<void> {
			const message = parse(text);
			if (!message) return;

			if (message.t === "hello") {
				connection = await register(socket, message.token);
				return;
			}
			if (!connection) return;

			const room = roomAt(connection.gameId);
			const entry = room?.presence.get(connection.playerId);

			switch (message.t) {
				case "ping":
					// Liveness only; it carries no timing payload.
					send(socket, { t: "pong" });
					return;
				case "pos": {
					if (!room || !entry) return;
					reportDriftOnce(connection, message.fix);
					// A frame from before this field existed, or a hand-rolled one, ages
					// from arrival rather than from capture — the old behaviour, which
					// under-reports rather than inventing a number.
					const capturedAgeMs = Number.isFinite(message.capturedAgeMs)
						? Math.max(0, message.capturedAgeMs)
						: 0;
					// A delayed frame, or a heartbeat of a held fix, must not rewind a
					// newer tracker ping that landed while this one was in flight.
					if (!isFresherFix(entry, capturedAgeMs)) return;
					entry.fix = {
						...message.fix,
						// The sender's own `capturedAt` is trusted and relayed unchanged.
						// This is noted alongside it so `stampAges` knows how long the fix
						// has sat *here*; neither one is staleness on its own.
						receivedAt: Date.now(),
					};
					entry.capturedAgeMs = capturedAgeMs;
					room.dirty = true;
					return;
				}
				case "batt": {
					if (!room || !entry) return;
					entry.battery = {
						level: message.level,
						charging: message.charging,
					};
					room.dirty = true;
					return;
				}
			}
		}

		function reportDriftOnce(connection: Connection, fix: ClientFix): void {
			if (connection.driftReported) return;
			const offsetMs = fix.capturedAt - Date.now();
			if (Math.abs(offsetMs) < CLOCK_DRIFT_THRESHOLD_MS) return;
			connection.driftReported = true;
			// Advisory, local, never corrective and never propagated. It goes to the
			// device whose clock is odd, and to nobody else.
			send(connection.socket, { t: "clockDrift", offsetMs });
		}
	});
}

async function register(
	socket: WebSocket,
	token: string,
): Promise<Connection | null> {
	let claims: Awaited<ReturnType<typeof verifyGameToken>>;
	try {
		claims = await verifyGameToken(token);
	} catch {
		send(socket, { t: "bye", reason: "invalid" });
		socket.close();
		return null;
	}

	const [player] = await db
		.select({ displayName: drizzleSchema.player.displayName })
		.from(drizzleSchema.player)
		.where(eq(drizzleSchema.player.id, claims.sub))
		.limit(1);

	if (!player) {
		send(socket, { t: "bye", reason: "invalid" });
		socket.close();
		return null;
	}

	/**
	 * Read before the room exists, and this order is load-bearing.
	 *
	 * `roomFor` starts a fan-out timer, and a tick that finds a room with no
	 * connections tears it down — so an await between creating the room and
	 * joining it is a window in which this socket ends up holding a room that is
	 * no longer in the map, with its interval cleared. That connection would
	 * never receive a presence frame and every `pos` it sent would be dropped,
	 * because `handleMessage` looks the room up by game id. Hydration is the one
	 * await that may sit inside the window, and only because `closeRoomIfEmpty`
	 * waits for it explicitly.
	 */
	const { teamId, role } = await resolveRole(claims.gameId, claims.sub);

	const room = roomFor(claims.gameId, (open) => void tick(claims.gameId, open));
	await hydrate(claims.gameId, room);

	// One connection per player. A second tab replaces the first rather than
	// racing it, which keeps `latest-per-player` meaningful.
	for (const existing of room.connections) {
		if (existing.playerId === claims.sub) {
			send(existing.socket, { t: "bye", reason: "replaced" });
			existing.socket.close();
			room.connections.delete(existing);
		}
	}

	const connection: Connection = {
		socket,
		gameId: claims.gameId,
		playerId: claims.sub,
		teamId,
		role,
		roleReadAt: Date.now(),
		driftReported: false,
	};
	room.connections.add(connection);

	/**
	 * Updated in place, never replaced. A page reload is a new socket for a
	 * player whose last position is still perfectly good, and blanking it would
	 * put every other device back to "no position" for as long as the reloaded
	 * phone took to get a fix. m2-spec §6.
	 */
	const existing = room.presence.get(claims.sub);
	if (existing) {
		existing.displayName = player.displayName;
		existing.teamId = teamId;
		existing.role = role;
		existing.roleReadAt = connection.roleReadAt;
		if (!existing.online) existing.onlineSince = Date.now();
		existing.online = true;
	} else {
		room.presence.set(claims.sub, {
			playerId: claims.sub,
			displayName: player.displayName,
			teamId,
			role,
			fix: null,
			battery: null,
			onlineSince: Date.now(),
			online: true,
			fixAgeMs: null,
			lastSeenAgeMs: 0,
			capturedAgeMs: null,
			roleReadAt: connection.roleReadAt,
		});
	}
	room.dirty = true;

	send(socket, {
		t: "presence",
		entries: visibleTo(connection, stampAges(room.presence.values())),
	});

	return connection;
}

/**
 * Fill a fresh room from the durable log. m15-spec §5.
 *
 * The room is in-memory and dies with its last socket, which is correct — it is
 * a fan-out buffer, not a record. What makes that survivable is that the record
 * exists elsewhere: every position the room ever held was also written to
 * `positionSnapshot`, including the ones that arrived over the tracking webhook
 * from a phone with no browser open at all. So the first `hello` into an empty
 * room reads the last thing known about *everybody* rather than only about the
 * player who happened to reconnect first — otherwise a player coming back to a
 * table of externally-tracked teammates would see an empty map and conclude the
 * feature was broken.
 *
 * Entries already present are left alone: a live socket's fix is never older
 * than the log's copy of it.
 */
async function hydrate(gameId: string, room: Room): Promise<void> {
	if (room.hydrated) return;
	// One fill per room. A second socket arriving mid-query waits for it
	// rather than sending a hello snapshot of an empty map, and rather than
	// starting a second fill of its own.
	if (!room.hydrating) {
		room.hydrating = fillRoomFromLog(gameId, room)
			.then(() => {
				room.hydrated = true;
			})
			.finally(() => {
				room.hydrating = null;
			});
	}
	await room.hydrating;
}

async function fillRoomFromLog(gameId: string, room: Room): Promise<void> {
	// Players who left get no marker, however recently they were seen. m2-spec §4.
	const players = await db
		.select({
			id: drizzleSchema.player.id,
			displayName: drizzleSchema.player.displayName,
		})
		.from(drizzleSchema.player)
		.where(
			and(
				eq(drizzleSchema.player.gameId, gameId),
				isNull(drizzleSchema.player.leftAt),
			),
		);

	let added = false;
	const now = Date.now();
	for (const player of players) {
		if (room.presence.has(player.id)) continue;

		const [last] = await db
			.select({
				fix: drizzleSchema.positionSnapshot.fix,
				capturedAt: drizzleSchema.positionSnapshot.capturedAt,
				receivedAt: drizzleSchema.positionSnapshot.receivedAt,
			})
			.from(drizzleSchema.positionSnapshot)
			.where(
				and(
					eq(drizzleSchema.positionSnapshot.gameId, gameId),
					eq(drizzleSchema.positionSnapshot.playerId, player.id),
					isNotNull(drizzleSchema.positionSnapshot.receivedAt),
				),
			)
			/**
			 * The last thing we *heard*, not the last thing a phone claims to have
			 * captured. Replay orders by `capturedAt` and is right to — that is the
			 * sender's own clock and the trail belongs to it — but one player can
			 * have two senders here, a browser and a tracker app on a different
			 * device, and picking between them by their own clocks compares two of
			 * them. `receivedAt` is this machine's, on every row, from both paths.
			 * m0-spec §7.
			 */
			.orderBy(desc(drizzleSchema.positionSnapshot.receivedAt))
			.limit(1);

		if (!last?.receivedAt) continue;
		const { teamId, role } = await resolveRole(gameId, player.id);

		// A webhook ping (or the connecting player's own register) can have
		// created this entry while we were reading. Leave it: whatever is already
		// in the room is at least as fresh as the log, and overwriting would
		// discard a live fix for a stored one.
		if (room.presence.has(player.id)) continue;

		room.presence.set(player.id, {
			playerId: player.id,
			displayName: player.displayName,
			teamId,
			role,
			fix: { ...last.fix, receivedAt: last.receivedAt },
			// Never restored. A battery reading outlives its truth faster than a
			// position does, and one read out of the log is exactly the fourth
			// state m2-spec §7 refuses to have.
			battery: null,
			/**
			 * When we last heard from them, on this machine's clock — which is what
			 * "last seen" means and, for a phone that has been reporting over the
			 * webhook with no browser open, is a good deal more recent than any
			 * socket it ever held.
			 */
			onlineSince: last.receivedAt,
			online: false,
			fixAgeMs: null,
			lastSeenAgeMs: 0,
			/**
			 * Zero, so the age falls back to `now - receivedAt`. The true captured
			 * age is not recoverable from a stored row without subtracting a phone's
			 * clock from this one's, so the log's age is the floor rather than the
			 * truth: it under-reports by the original acquisition gap and never
			 * invents a number.
			 */
			capturedAgeMs: 0,
			roleReadAt: now,
		});
		added = true;
	}
	if (added) room.dirty = true;
}

function parse(text: string): EphemeralUp | null {
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value !== "object" || value === null || !("t" in value)) {
			return null;
		}
		return value as EphemeralUp;
	} catch {
		return null;
	}
}
