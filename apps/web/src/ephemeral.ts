import type { BatteryState, ClientFix, TeamRole } from "@zero-lag/schema";
import { serverUrl } from "./dev-origin";

/**
 * Client half of the ephemeral channel. m0-spec §8.
 *
 * Nothing here is retried and nothing here is queued. If a fix cannot be sent
 * it is dropped, and the other side's staleness marker greys out, which is the
 * honest outcome. The queued, durable half lives in position-log.ts.
 */

export type PresenceEntry = {
	playerId: string;
	displayName: string;
	teamId: string | null;
	role: TeamRole | null;
	fix: (ClientFix & { receivedAt: number | null }) | null;
	battery: BatteryState | null;
	onlineSince: number;
	/** False once the socket has gone. The entry, and its last fix, remain. */
	online: boolean;
	/** How old the fix was when the server sent it. m2-spec §5. */
	fixAgeMs: number | null;
};

export type EphemeralState = {
	readonly connected: boolean;
	readonly entries: readonly PresenceEntry[];
	/**
	 * This device's clock, read when the frame carrying `entries` arrived.
	 *
	 * Half of the age arithmetic in m2-spec §5: an entry's age on screen is
	 * `fixAgeMs + (Date.now() - entriesArrivedAt)` — two elapsed durations added,
	 * each measured on one clock. No absolute timestamp from one device is ever
	 * compared with another's, which is what m0-spec §7 promises and what
	 * `Date.now() - capturedAt` quietly broke.
	 */
	readonly entriesArrivedAt: number;
	/** Set once if this device's own clock is minutes away from the server's. */
	readonly clockOffsetMs: number | null;
};

type Listener = (state: EphemeralState) => void;

/** Clients send at most this often, and only when something changed. */
const MIN_SEND_INTERVAL_MS = 3_000;
const MIN_SEND_DISTANCE_M = 10;
const FORCE_SEND_AFTER_MS = 10_000;

/**
 * How often the channel re-offers the fix it is holding. m2-spec §5 and §6.
 *
 * The third inherited defect, and the one M2 found by watching a marker fail to
 * move. `sendPosition` was only ever called from a `watchPosition` callback, so
 * both of its heuristics were unreachable in the two cases that matter most:
 *
 * - A fix arriving inside the 3 s throttle window was dropped and never
 *   re-offered. `watchPosition` does not call back again for a phone that has
 *   arrived somewhere and stopped, so the position it moved to was simply never
 *   sent.
 * - `FORCE_SEND_AFTER_MS` could never fire on a stationary phone, for the same
 *   reason. Its marker's `receivedAt` was stamped once and then aged through
 *   §5's buckets while the phone sat there online with a perfectly good lock —
 *   a hider standing on a platform would have looked stale to everyone within
 *   two minutes, which is the whole hiding phase.
 *
 * Re-offering is not a retry and not a queue: `sendPosition` is handed the one
 * fix already held, and every existing rule about distance and interval still
 * decides whether it goes.
 */
const HEARTBEAT_MS = 2_000;

export class EphemeralChannel {
	readonly #token: string;
	#socket: WebSocket | null = null;
	#listeners = new Set<Listener>();
	#state: EphemeralState = {
		connected: false,
		entries: [],
		entriesArrivedAt: Date.now(),
		clockOffsetMs: null,
	};
	#lastSentAt = 0;
	#lastSent: ClientFix | null = null;
	/**
	 * Where this device is *now*, whether or not the socket was open when it
	 * found out.
	 *
	 * This is state, not a queue. At most one fix is held, always the newest, and
	 * a newer one replaces it rather than joining it — so "nothing here is
	 * retried and nothing here is queued" still holds. It exists because a
	 * stationary phone gets one `watchPosition` callback and no more: without it,
	 * a device whose socket happened to still be connecting at that instant
	 * reports no position for as long as it stands still, which on a station
	 * platform is the whole of the hiding phase.
	 */
	#current: ClientFix | null = null;
	#currentBattery: BatteryState | null = null;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#heartbeat: ReturnType<typeof setInterval> | null = null;
	#closed = false;

	constructor(token: string) {
		this.#token = token;
	}

	get state(): EphemeralState {
		return this.#state;
	}

	subscribe(listener: Listener): () => void {
		this.#listeners.add(listener);
		listener(this.#state);
		return () => this.#listeners.delete(listener);
	}

	connect(): void {
		if (this.#closed || this.#socket) return;
		this.#heartbeat ??= setInterval(() => {
			if (this.#current) this.sendPosition(this.#current);
		}, HEARTBEAT_MS);
		const url = new URL(serverUrl());
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.pathname = "/api/ephemeral";

		const socket = new WebSocket(url);
		this.#socket = socket;

		/**
		 * A closed channel never introduces itself, and the guard is the whole
		 * point of this handler.
		 *
		 * `close()` cannot cancel a handshake, so a socket abandoned mid-connect
		 * finishes connecting anyway. Without this check it then said `hello` —
		 * and the server's one-connection-per-player rule is "newest wins", so the
		 * dying socket replaced the live one that had already taken its place,
		 * which was then sent `bye: replaced` and stopped reconnecting on purpose.
		 * The result was a phone with no presence stream at all, for the rest of
		 * the game, whenever a remount lost that race. Every screen change is a
		 * remount, and so is every StrictMode double-mount in development.
		 */
		socket.addEventListener("open", () => {
			if (this.#closed) {
				socket.close();
				return;
			}
			socket.send(JSON.stringify({ t: "hello", token: this.#token }));
			this.#patch({ connected: true });
			// Re-announce where we are, because the room has just learned we exist
			// and otherwise would not find out until this phone moved.
			this.#announce();
		});

		socket.addEventListener("message", (raw) => {
			this.#receive(String(raw.data));
		});

		/**
		 * The entries survive the socket, on the reading side too. m2-spec §11.
		 *
		 * M0 emptied them here, so a phone entering a tunnel lost every marker it
		 * had — the same "vanishes rather than goes stale" mistake the server made
		 * on close, seen from the other end. What it knew a moment ago is still the
		 * best information available, and it ages through §5's buckets from the
		 * frame it arrived in rather than being thrown away. A reconnect replaces
		 * the lot with a fresh frame.
		 */
		socket.addEventListener("close", () => {
			this.#socket = null;
			this.#patch({ connected: false });
			this.#scheduleReconnect();
		});

		socket.addEventListener("error", () => socket.close());
	}

	close(): void {
		this.#closed = true;
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		if (this.#heartbeat) clearInterval(this.#heartbeat);
		this.#heartbeat = null;
		const socket = this.#socket;
		this.#socket = null;
		if (!socket) return;
		if (socket.readyState === WebSocket.CONNECTING) {
			// Closing a socket mid-handshake logs a warning and leaves the server
			// with a half-open connection, so let it finish first. `#closed` is
			// already true, so the open handler above says nothing and hangs up.
			return;
		}
		socket.close();
	}

	/**
	 * Returns whether the fix was actually sent. A `false` is not a failure —
	 * it means nothing has changed enough to be worth a frame.
	 */
	sendPosition(fix: ClientFix): boolean {
		// Recorded before the socket is consulted: this is where the device is,
		// and that stays true whether or not it could be said out loud.
		this.#current = fix;
		if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
			return false;
		}
		const now = Date.now();
		if (now - this.#lastSentAt < MIN_SEND_INTERVAL_MS) return false;
		if (this.#lastSent && !this.#worthSending(fix, now)) return false;

		this.#socket.send(JSON.stringify({ t: "pos", fix }));
		this.#lastSent = fix;
		this.#lastSentAt = now;
		return true;
	}

	sendBattery(battery: BatteryState): void {
		this.#currentBattery = battery;
		if (this.#socket?.readyState !== WebSocket.OPEN) return;
		this.#socket.send(
			JSON.stringify({
				t: "batt",
				level: battery.level,
				charging: battery.charging,
			}),
		);
	}

	/**
	 * Say where we are, now that somebody is listening. Bypasses the movement and
	 * interval heuristics, which exist to keep a *moving* phone from chattering
	 * and would otherwise suppress the one frame a newly-joined room needs.
	 */
	#announce(): void {
		const socket = this.#socket;
		if (socket?.readyState !== WebSocket.OPEN) return;

		if (this.#current) {
			socket.send(JSON.stringify({ t: "pos", fix: this.#current }));
			this.#lastSent = this.#current;
			this.#lastSentAt = Date.now();
		}
		if (this.#currentBattery) {
			socket.send(
				JSON.stringify({
					t: "batt",
					level: this.#currentBattery.level,
					charging: this.#currentBattery.charging,
				}),
			);
		}
	}

	#worthSending(fix: ClientFix, now: number): boolean {
		if (now - this.#lastSentAt > FORCE_SEND_AFTER_MS) return true;
		const previous = this.#lastSent;
		if (!previous) return true;
		// Rough metres — this is a send-or-not heuristic, not geometry.
		const dx =
			(fix.lng - previous.lng) * 111_320 * Math.cos((fix.lat * Math.PI) / 180);
		const dy = (fix.lat - previous.lat) * 110_540;
		return Math.hypot(dx, dy) > MIN_SEND_DISTANCE_M;
	}

	#receive(text: string): void {
		let message: unknown;
		try {
			message = JSON.parse(text);
		} catch {
			return;
		}
		if (typeof message !== "object" || message === null || !("t" in message)) {
			return;
		}
		const typed = message as
			| { t: "presence"; entries: PresenceEntry[] }
			| { t: "pong" }
			| { t: "clockDrift"; offsetMs: number }
			| { t: "bye"; reason: string };

		switch (typed.t) {
			case "presence":
				this.#patch({
					entries: typed.entries,
					entriesArrivedAt: Date.now(),
				});
				return;
			case "clockDrift":
				this.#patch({ clockOffsetMs: typed.offsetMs });
				return;
			case "bye":
				this.#closed = typed.reason === "replaced";
				return;
			default:
				return;
		}
	}

	#scheduleReconnect(): void {
		if (this.#closed || this.#reconnectTimer) return;
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.connect();
		}, 2_000);
	}

	#patch(partial: Partial<EphemeralState>): void {
		this.#state = { ...this.#state, ...partial };
		for (const listener of this.#listeners) listener(this.#state);
	}
}
