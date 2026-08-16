import { env } from "@zero-lag/env/web";
import type { BatteryState, ClientFix, TeamRole } from "@zero-lag/schema";

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
};

export type EphemeralState = {
	readonly connected: boolean;
	readonly entries: readonly PresenceEntry[];
	/** Set once if this device's own clock is minutes away from the server's. */
	readonly clockOffsetMs: number | null;
};

type Listener = (state: EphemeralState) => void;

/** Clients send at most this often, and only when something changed. */
const MIN_SEND_INTERVAL_MS = 3_000;
const MIN_SEND_DISTANCE_M = 10;
const FORCE_SEND_AFTER_MS = 10_000;

export class EphemeralChannel {
	readonly #token: string;
	#socket: WebSocket | null = null;
	#listeners = new Set<Listener>();
	#state: EphemeralState = {
		connected: false,
		entries: [],
		clockOffsetMs: null,
	};
	#lastSentAt = 0;
	#lastSent: ClientFix | null = null;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
		const url = new URL(env.VITE_SERVER_URL);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.pathname = "/api/ephemeral";

		const socket = new WebSocket(url);
		this.#socket = socket;

		socket.addEventListener("open", () => {
			socket.send(JSON.stringify({ t: "hello", token: this.#token }));
			this.#patch({ connected: true });
		});

		socket.addEventListener("message", (raw) => {
			this.#receive(String(raw.data));
		});

		socket.addEventListener("close", () => {
			this.#socket = null;
			this.#patch({ connected: false, entries: [] });
			this.#scheduleReconnect();
		});

		socket.addEventListener("error", () => socket.close());
	}

	close(): void {
		this.#closed = true;
		if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
		const socket = this.#socket;
		this.#socket = null;
		if (!socket) return;
		if (socket.readyState === WebSocket.CONNECTING) {
			// Closing a socket mid-handshake logs a warning and leaves the server
			// with a half-open connection, so let it finish first.
			socket.addEventListener("open", () => socket.close());
			return;
		}
		socket.close();
	}

	/**
	 * Returns whether the fix was actually sent. A `false` is not a failure —
	 * it means nothing has changed enough to be worth a frame.
	 */
	sendPosition(fix: ClientFix): boolean {
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
		if (this.#socket?.readyState !== WebSocket.OPEN) return;
		this.#socket.send(
			JSON.stringify({
				t: "batt",
				level: battery.level,
				charging: battery.charging,
			}),
		);
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
				this.#patch({ entries: typed.entries });
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
