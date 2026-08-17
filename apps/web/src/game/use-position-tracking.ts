import { useZero } from "@rocicorp/zero/react";
import { webPlatform } from "@zero-lag/platform/web";
import {
	mutators,
	type PositionReason,
	type PositionSnapshot,
} from "@zero-lag/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EphemeralChannel } from "../ephemeral";
import { PositionLog } from "../position-log";

interface PositionTrackingInput {
	gameId: string;
	teamId: string | null;
	roundId: string | null;
	intervalMs: number;
	channel: EphemeralChannel | null;
}

/** How often an idle client retries a queue it could not empty. */
const DRAIN_INTERVAL_MS = 3_000;

/**
 * The same fix has two fates, and this is where they part. m0-spec §8.
 *
 * It is broadcast on the ephemeral channel, where it is dropped if it cannot be
 * delivered — and it is appended to a local queue on the configured interval,
 * where it waits for a connection however long that takes.
 */
export function usePositionTracking({
	gameId,
	teamId,
	roundId,
	intervalMs,
	channel,
}: PositionTrackingInput) {
	const zero = useZero();
	const [queueSize, setQueueSize] = useState(0);
	const [lastFix, setLastFix] = useState<PositionSnapshot | null>(null);

	const logRef = useRef<PositionLog | null>(null);
	if (!logRef.current) logRef.current = new PositionLog(gameId);

	const latest = useRef<PositionSnapshot | null>(null);
	const drainRef = useRef<() => void>(() => {});
	const teamRef = useRef(teamId);
	const roundRef = useRef(roundId);
	const channelRef = useRef(channel);
	teamRef.current = teamId;
	roundRef.current = roundId;
	channelRef.current = channel;

	const sample = useCallback(async (reason: PositionReason) => {
		const log = logRef.current;
		const team = teamRef.current;
		if (!log || !team) return;

		const fix = latest.current ?? (await webPlatform.location.getCurrent());
		// Sampling learns where this phone is, so presence hears about it too.
		// The two fates of a fix are different destinations, not different fixes.
		latest.current = fix;
		setLastFix(fix);
		channelRef.current?.sendPosition(fix);

		log.add({
			id: crypto.randomUUID(),
			roundId: roundRef.current,
			teamId: team,
			fix: {
				lng: fix.lng,
				lat: fix.lat,
				accuracyMeters: fix.accuracyMeters,
				headingDeg: fix.headingDeg,
				speedMps: fix.speedMps,
				capturedAt: fix.capturedAt,
				source: fix.source,
			},
			reason,
		});
		setQueueSize(log.size);
		drainRef.current();
	}, []);

	// Live position: straight to the lossy channel, never queued.
	useEffect(() => {
		let live = true;
		const receive = (fix: PositionSnapshot) => {
			if (!live) return;
			latest.current = fix;
			setLastFix(fix);
			channel?.sendPosition(fix);
		};

		/**
		 * A one-shot read alongside the watch, and it is not belt-and-braces.
		 *
		 * `watchPosition` takes seconds to deliver its first fix and a phone that
		 * does not move may get exactly one ever — so a device standing on a
		 * platform would report no position for the whole of the hiding phase,
		 * which is when standing still is the entire plan. It also re-runs when
		 * the channel appears, because a socket that has just opened has not been
		 * told anything yet.
		 */
		void webPlatform.location.getCurrent().then(receive);
		const stop = webPlatform.location.watch(receive);

		return () => {
			live = false;
			stop();
		};
	}, [channel]);

	// The durable log's cadence. Configurable, because it sets both replay
	// resolution and M8's suggestion freshness.
	useEffect(() => {
		const timer = setInterval(() => void sample("interval"), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs, sample]);

	useEffect(() => {
		const log = logRef.current;
		if (!log) return;

		async function drain() {
			if (!log) return;
			await log.flush(async (batch) => {
				const result = zero.mutate(
					mutators.position.record({
						snapshots: batch.map((entry) => ({
							id: entry.id,
							roundId: entry.roundId,
							teamId: entry.teamId,
							fix: entry.fix,
							reason: entry.reason,
						})),
					}),
				);
				// Only entries the server actually holds leave the queue.
				await result.server;
			});
			setQueueSize(log.size);
		}

		/**
		 * Polled rather than purely edge-triggered.
		 *
		 * Draining only on the `connected` transition looks sufficient and is not:
		 * a client that never *observably* left `connected` — a dead socket that
		 * has not been noticed yet, a queue that grew while online — would sit on
		 * its backlog indefinitely waiting for an edge that already happened.
		 */
		drainRef.current = () => {
			if (zero.connection.state.current.name === "connected") void drain();
		};

		const unsubscribe = zero.connection.state.subscribe((state) => {
			if (state.name === "connected") void drain();
		});
		const timer = setInterval(() => drainRef.current(), DRAIN_INTERVAL_MS);
		drainRef.current();

		return () => {
			unsubscribe();
			clearInterval(timer);
			drainRef.current = () => {};
		};
	}, [zero]);

	return { queueSize, lastFix, sample };
}
