import type { ClientFix, PositionReason } from "@zero-lag/schema";

/**
 * The durable position log, and the reason it is not the same thing as
 * presence. m0-spec §8.
 *
 * Presence is lossy on purpose: a broadcast that cannot be delivered now is
 * worthless in five seconds. This is not. Each fix goes into a local queue that
 * survives a reload, and the queue flushes on reconnect — so a player who spends
 * ten minutes in a tunnel contributes ten minutes of track the moment they
 * surface, ordered by their own `capturedAt` rather than by when the signal
 * came back.
 */

export type QueuedSnapshot = {
	readonly id: string;
	readonly roundId: string | null;
	readonly teamId: string;
	readonly fix: ClientFix;
	readonly reason: PositionReason;
};

/** One mutation carries at most this many; the mutator enforces the same bound. */
const BATCH_SIZE = 500;

export class PositionLog {
	readonly #key: string;
	#pending: QueuedSnapshot[];
	#flushing = false;

	constructor(gameId: string) {
		this.#key = `zero-lag.positionLog.${gameId}`;
		this.#pending = this.#read();
	}

	get size(): number {
		return this.#pending.length;
	}

	add(snapshot: QueuedSnapshot): void {
		this.#pending.push(snapshot);
		this.#write();
	}

	/**
	 * Drains into `send` in batches, removing only what was accepted. A failure
	 * leaves the queue exactly as it was, which is the whole point of it existing.
	 */
	async flush(
		send: (batch: QueuedSnapshot[]) => Promise<unknown>,
	): Promise<number> {
		if (this.#flushing || this.#pending.length === 0) return 0;
		this.#flushing = true;
		let sent = 0;
		try {
			while (this.#pending.length > 0) {
				const batch = this.#pending.slice(0, BATCH_SIZE);
				await send(batch);
				this.#pending = this.#pending.slice(batch.length);
				this.#write();
				sent += batch.length;
			}
		} finally {
			this.#flushing = false;
		}
		return sent;
	}

	#read(): QueuedSnapshot[] {
		const raw = localStorage.getItem(this.#key);
		if (!raw) return [];
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as QueuedSnapshot[]) : [];
		} catch {
			return [];
		}
	}

	#write(): void {
		localStorage.setItem(this.#key, JSON.stringify(this.#pending));
	}
}
