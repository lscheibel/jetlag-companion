import type {
	BatteryState,
	PositionSnapshot,
	TeamRole,
} from "@zero-lag/schema";
import type { WebSocket } from "ws";

/**
 * The presence room: who is in a game, where they were last seen, and who is
 * allowed to know. m0-spec §8, m1-spec §9, m2-spec §5–§6.
 *
 * Everything here is in-memory and lossy on purpose. It knows only what has
 * been written into it: the database reads that decide a player's team and
 * role, and the sockets the result is fanned out over, both live in
 * `ephemeral.ts`, which is what lets this half be read — and tested — without a
 * connection to either.
 */

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

/** Server fans out at most this often per game, coalescing to latest-per-player. */
export const FANOUT_INTERVAL_MS = 2_000;

/** Roles change between rounds; a connection re-reads its own no more often than this. */
export const ROLE_TTL_MS = 5_000;

export type Connection = {
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
export type TrackedEntry = PresenceEntry & {
	capturedAgeMs: number | null;
	/**
	 * When we last resolved this entry's team and role, on this machine.
	 * Same TTL as a connection's `roleReadAt`, so a tracker-only player is
	 * re-read on the same cadence as one with a socket. Stripped at fan-out.
	 */
	roleReadAt: number;
};

export type Room = {
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

/**
 * The room for a game, opening one if there is none.
 *
 * The fan-out is passed in rather than called directly, because fanning out
 * means re-reading roles from the database and writing to sockets — the two
 * things this module deliberately does not know about. The timer belongs to the
 * room either way: it is what `closeRoomIfEmpty` has to clear.
 */
export function roomFor(gameId: string, onTick: (room: Room) => void): Room {
	const existing = rooms.get(gameId);
	if (existing) return existing;

	const room: Room = {
		presence: new Map(),
		connections: new Set(),
		dirty: false,
		hydrated: false,
		hydrating: null,
		timer: setInterval(() => {
			onTick(room);
		}, FANOUT_INTERVAL_MS),
	};
	rooms.set(gameId, room);
	return room;
}

/** The room for a game, if one is open. */
export function roomAt(gameId: string): Room | undefined {
	return rooms.get(gameId);
}

export function closeRoomIfEmpty(gameId: string, room: Room): void {
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
export function visibleTo(
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
export function stampAges(entries: Iterable<TrackedEntry>): PresenceEntry[] {
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
	roomFor(gameId, () => {});
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
