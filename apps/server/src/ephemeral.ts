import type { Server } from "node:http";
import type {
	BatteryState,
	ClientFix,
	PositionSnapshot,
	TeamRole,
} from "@zero-lag/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
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
	| { t: "pos"; fix: ClientFix }
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

type Room = {
	presence: Map<string, PresenceEntry>;
	connections: Set<Connection>;
	dirty: boolean;
	timer: NodeJS.Timeout;
};

const rooms = new Map<string, Room>();

function roomFor(gameId: string): Room {
	const existing = rooms.get(gameId);
	if (existing) return existing;

	const room: Room = {
		presence: new Map(),
		connections: new Set(),
		dirty: false,
		timer: setInterval(() => {
			void tick(gameId, room);
		}, FANOUT_INTERVAL_MS),
	};
	rooms.set(gameId, room);
	return room;
}

function closeRoomIfEmpty(gameId: string, room: Room): void {
	if (room.connections.size > 0) return;
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
		// holding up is information about a seeker team.
		visible.push({ ...entry, fix: null, battery: null });
	}
	return visible;
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
	for (const connection of room.connections) {
		if (await refreshRole(connection)) changed = true;
	}
	if (!room.dirty && !changed) {
		closeRoomIfEmpty(gameId, room);
		return;
	}
	room.dirty = false;

	const entries = [...room.presence.values()];
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
	}
	return changed;
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

		socket.on("close", () => {
			if (!connection) return;
			const room = rooms.get(connection.gameId);
			if (!room) return;
			room.connections.delete(connection);
			room.presence.delete(connection.playerId);
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
					entry.fix = {
						...message.fix,
						// The sender's own `capturedAt` is trusted and relayed unchanged;
						// this is noted alongside it and is never what staleness is
						// computed from.
						receivedAt: Date.now(),
					};
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

	const room = roomFor(claims.gameId);
	const { teamId, role } = await resolveRole(claims.gameId, claims.sub);

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
	room.presence.set(claims.sub, {
		playerId: claims.sub,
		displayName: player.displayName,
		teamId,
		role,
		fix: null,
		battery: null,
		onlineSince: Date.now(),
	});
	room.dirty = true;

	send(socket, {
		t: "presence",
		entries: visibleTo(connection, room.presence.values()),
	});

	return connection;
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
