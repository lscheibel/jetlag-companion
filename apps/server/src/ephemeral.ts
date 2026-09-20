import type { Server } from "node:http";
import type {
	BatteryState,
	ClientFix,
	PositionSnapshot,
	TeamRole,
} from "@zero-lag/schema";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { type WebSocket, WebSocketServer } from "ws";
import { verifyGameToken } from "./auth";
import { db, drizzleSchema } from "./db";

/**
 * The ephemeral channel. m0-spec §8.
 *
 * Everything here is in-memory and lossy on purpose. A `pos` broadcast that
 * cannot be delivered right now is worthless in five seconds: it is dropped,
 * never queued, and the receiving client's stale marker greys out — which is
 * the honest outcome. The *durable* position log is a different thing entirely
 * and travels over Zero.
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

export type PresenceEntry = {
	playerId: string;
	displayName: string;
	teamId: string | null;
	role: TeamRole | null;
	fix: PositionSnapshot | null;
	battery: BatteryState | null;
	onlineSince: number;
	/**
	 * An entry outlives its socket. m2-spec §6.
	 *
	 * M0 deleted the entry on close, so a phone entering a tunnel did not go
	 * stale — it vanished from every other device, taking its last known position
	 * with it. "Last seen 5 minutes ago" was unimplementable against that.
	 */
	online: boolean;
	/**
	 * How old the fix is, measured as a sum of elapsed durations. m2-spec §5.
	 *
	 * `capturedAgeMs` (the device's own clock, subtracted from itself) plus the
	 * time this machine has held the fix since `receivedAt` (this clock,
	 * subtracted from itself). The reader then adds the time since the frame
	 * arrived, on its clock. No term crosses a clock boundary, which is what
	 * m0-spec §7 requires, and the sum counts the acquisition and transport gap
	 * that `now - receivedAt` alone silently discards. Null when there has never
	 * been a fix.
	 */
	fixAgeMs: number | null;
	/**
	 * How long since this player was last online, measured here, at fan-out.
	 *
	 * Zero while they are online. The same clock rule as `fixAgeMs`: one elapsed
	 * duration, counted on this machine, so a reader can add the time since the
	 * frame arrived without ever subtracting one device clock from another.
	 */
	lastSeenAgeMs: number;
};

export type EphemeralDown =
	| { t: "presence"; entries: PresenceEntry[] }
	| { t: "pong" }
	| { t: "clockDrift"; offsetMs: number }
	| {
			t: "bye";
			reason: "token_expired" | "game_ended" | "replaced" | "invalid";
	  };

/** Server fans out at most this often per game, coalescing to latest-per-player. */
const FANOUT_INTERVAL_MS = 2_000;

/** Roles change between rounds; a connection re-reads its own no more often than this. */
const ROLE_TTL_MS = 5_000;

/** Past this, a device's own clock is worth mentioning to its owner. And only to them. */
const CLOCK_DRIFT_THRESHOLD_MS = 120_000;

type Connection = {
	socket: WebSocket;
	gameId: string;
	playerId: string;
	teamId: string | null;
	role: TeamRole | null;
	roleReadAt: number;
	driftReported: boolean;
};

/**
 * A presence entry plus the one input to its age that is never sent onward.
 *
 * `capturedAgeMs` is a measurement taken on the *sending* device, and it is
 * kept here so that `stampAges` can add this machine's own elapsed time to it
 * at fan-out. It is stripped on the way out: what a reader needs is the total,
 * and a per-entry breakdown would have to be blanked by `visibleTo` alongside
 * `fixAgeMs` to avoid telling a seeker that a hider's phone just got a fix.
 */
type TrackedEntry = PresenceEntry & {
	capturedAgeMs: number | null;
	/**
	 * When we last resolved this entry's team and role, on this machine.
	 * Same TTL as a connection's `roleReadAt`, so a tracker-only player is
	 * re-read on the same cadence as one with a socket. Stripped at fan-out.
	 */
	roleReadAt: number;
};

type Room = {
	presence: Map<string, TrackedEntry>;
	connections: Set<Connection>;
	dirty: boolean;
	timer: NodeJS.Timeout;
	/**
	 * Whether this room has been filled from the durable log yet. m15-spec §5.
	 *
	 * A room is torn down when its last socket goes, so the first player back
	 * after everyone closed their phones would otherwise arrive to an empty map
	 * — including for teammates whose external trackers have been reporting the
	 * whole time. Hydration happens once per room rather than once per `hello`,
	 * because the second player through the door is joining a room that already
	 * knows everything the log could tell it.
	 */
	hydrated: boolean;
	/** In-flight fill, so a second `hello` waits rather than sending an empty snapshot. */
	hydrating: Promise<void> | null;
};

const rooms = new Map<string, Room>();

function roomFor(gameId: string): Room {
	const existing = rooms.get(gameId);
	if (existing) return existing;

	const room: Room = {
		presence: new Map(),
		connections: new Set(),
		dirty: false,
		hydrated: false,
		hydrating: null,
		timer: setInterval(() => {
			void tick(gameId, room);
		}, FANOUT_INTERVAL_MS),
	};
	rooms.set(gameId, room);
	return room;
}

function closeRoomIfEmpty(gameId: string, room: Room): void {
	if (room.connections.size > 0) return;
	// A first `hello` creates the room, then awaits the log. Tearing it down
	// in that window would orphan the fill and leave the next socket starting
	// from scratch — and a second socket waiting on `hydrating` waiting on a
	// room that is no longer in the map.
	if (room.hydrating) return;
	clearInterval(room.timer);
	rooms.delete(gameId);
}

/**
 * Visibility is applied here, per subscriber, at the moment of fan-out — and it
 * filters **fields, not entries**. m0-spec §8, corrected by m1-spec §9.
 *
 * > Everyone in a game can always see everyone else. What is secret is where
 * > they are.
 *
 * Seekers know perfectly well who is hiding: they ask them questions, read their
 * answers, and eventually go and find them. Hiding identity was never the game.
 * An earlier version of this function dropped whole entries, which hid the
 * roster — a lobby of five phones showed one, and a player with no team yet saw
 * nobody at all.
 *
 * There is no round-state precondition, because there is no moment at which a
 * seeker may see a hider's coordinates. The rule is the same in the lobby as in
 * a running round.
 *
 * Filtering happens here rather than in the client not because a seeker would
 * inspect the frames — the good-actor assumption holds — but because the
 * alternative makes an accidental leak a one-line UI mistake instead of an
 * impossible one.
 */
function visibleTo(
	connection: Connection,
	entries: Iterable<PresenceEntry>,
): PresenceEntry[] {
	const visible: PresenceEntry[] = [];
	for (const entry of entries) {
		if (carriesPosition(connection, entry)) {
			visible.push(entry);
			continue;
		}
		// Identity, team, role and online-ness always travel. `battery` follows
		// `fix` rather than identity, because how a seeker team's phones are
		// holding up is information about a seeker team — and so does `fixAgeMs`,
		// because "moved eight seconds ago" is a fact about a rival's movement.
		visible.push({ ...entry, fix: null, battery: null, fixAgeMs: null });
	}
	return visible;
}

/**
 * The age of every fix, measured on one clock at the moment of sending.
 *
 * Done once per fan-out rather than once per subscriber: every socket in the
 * room is being written to inside the same tick, so they would all measure the
 * same thing anyway, and one reading is one fewer way for two players to
 * disagree about how old a marker is.
 */
function stampAges(entries: Iterable<TrackedEntry>): PresenceEntry[] {
	const now = Date.now();
	return [...entries].map((entry) => {
		const {
			capturedAgeMs: _capturedAgeMs,
			roleReadAt: _roleReadAt,
			...rest
		} = entry;
		return {
			...rest,
			fixAgeMs: heldAgeMs(entry, now),
			lastSeenAgeMs: entry.online ? 0 : now - entry.onlineSince,
		};
	});
}

/** The two fields a marker's age is made of. */
export type AgedFix = {
	readonly fix: { readonly receivedAt: number | null } | null;
	readonly capturedAgeMs: number | null;
};

/**
 * How old the room's copy of a fix is, right now.
 *
 * `capturedAgeMs` was measured on the sending device, against its own clock;
 * the second term is this machine's clock against itself. Null when there has
 * never been a fix. One definition, used both at fan-out and by `isFresherFix`,
 * so the number a reader is shown and the number the room compares against are
 * the same number.
 */
function heldAgeMs(held: AgedFix, now: number): number | null {
	if (held.fix?.receivedAt == null || held.capturedAgeMs == null) return null;
	return held.capturedAgeMs + Math.max(0, now - held.fix.receivedAt);
}

/**
 * Whether a fix this old should replace the one the live marker is showing.
 *
 * Both sides are **ages**, not instants, and both are expressed against this
 * machine's clock: the incoming fix's age as its sender measured it, and the
 * held fix's age as `stampAges` would report it this instant. Ordering by
 * `capturedAt` instead would subtract a tracker phone's clock from a browser
 * device's — the one arithmetic m0-spec §7 forbids — and the two are routinely
 * different devices, since the setup flow exists to point a phone at a page
 * that may be open on a laptop. A device an innocent minute out would have one
 * of its two sources rejected for the whole time both were reporting, which is
 * precisely the failure background tracking is here to prevent.
 *
 * A tie keeps whatever is already showing, so the heartbeat re-offering a held
 * fix cannot churn the marker: it reports the same age the held fix has aged
 * into, because both count the same elapsed seconds.
 */
export function isFresherFix(
	held: AgedFix | null | undefined,
	incomingAgeMs: number,
	now = Date.now(),
): boolean {
	const heldAge = held == null ? null : heldAgeMs(held, now);
	return heldAge === null || incomingAgeMs < heldAge;
}

function carriesPosition(
	connection: Connection,
	entry: PresenceEntry,
): boolean {
	if (entry.playerId === connection.playerId) return true;
	// A hider sees every position in the game — every seeker team and every
	// other hider team.
	if (connection.role === "hider") return true;
	// A seeker, and anyone with no role yet, sees their own team and nobody
	// else: not the hiders, and not the other seeker teams.
	return connection.teamId !== null && entry.teamId === connection.teamId;
}

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

	const entry = rooms.get(connection.gameId)?.presence.get(connection.playerId);
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
			const room = rooms.get(connection.gameId);
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

			const room = rooms.get(connection.gameId);
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

	const room = roomFor(claims.gameId);
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

/**
 * A position that arrived over the tracking webhook rather than over a socket.
 * m15-spec §5.
 *
 * Creates the entry when there is none, which is the entire point: the player
 * this is reporting for typically has no browser open, and the people who need
 * to see them do. Silently does nothing when no room exists — nobody is
 * listening, and the durable log has the fix either way for whoever opens the
 * game next.
 */
export function applyExternalFix(input: {
	gameId: string;
	playerId: string;
	displayName: string;
	teamId: string | null;
	role: TeamRole | null;
	fix: PositionSnapshot;
	capturedAgeMs: number;
}): void {
	const room = rooms.get(input.gameId);
	if (!room) return;

	const now = Date.now();
	const entry = room.presence.get(input.playerId);
	if (entry) {
		// Standing is independent of the fix: a ping is also a chance to learn
		// that this player has joined a team or swapped sides since we last
		// wrote them, and `refreshRole` only walks sockets.
		entry.displayName = input.displayName;
		entry.teamId = input.teamId;
		entry.role = input.role;
		entry.roleReadAt = now;
		if (!entry.online) entry.onlineSince = now;
		if (isFresherFix(entry, input.capturedAgeMs, now)) {
			entry.fix = input.fix;
			entry.capturedAgeMs = input.capturedAgeMs;
		}
	} else {
		room.presence.set(input.playerId, {
			playerId: input.playerId,
			displayName: input.displayName,
			teamId: input.teamId,
			role: input.role,
			fix: input.fix,
			battery: null,
			onlineSince: now,
			// The socket is what `online` is about, and there isn't one. A fresh
			// marker on an offline player is not a contradiction: it says the phone
			// is out there reporting while its owner's screen is dark, which is the
			// state this whole feature exists to make visible.
			online: false,
			fixAgeMs: null,
			lastSeenAgeMs: 0,
			capturedAgeMs: input.capturedAgeMs,
			roleReadAt: now,
		});
	}
	room.dirty = true;
}

/**
 * Opens an empty presence room so `applyExternalFix` has somewhere to write.
 * Tests only: production rooms are created by a socket `hello`.
 */
export function openPresenceRoom(gameId: string): () => void {
	roomFor(gameId);
	return () => {
		const room = rooms.get(gameId);
		if (!room) return;
		clearInterval(room.timer);
		rooms.delete(gameId);
	};
}

/** The live marker `applyExternalFix` last wrote, for tests. */
export function readPresence(gameId: string, playerId: string) {
	return rooms.get(gameId)?.presence.get(playerId);
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
