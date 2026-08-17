import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import type { EphemeralState } from "../ephemeral";
import { ageOf, positionLabel } from "../map/staleness";
import { useNow } from "../map/use-now";
import { Panel } from "./panel";

interface PresenceProps {
	state: EphemeralState;
	queueSize: number;
	lastCapturedAt: number | null;
}

export function Presence({ state, queueSize, lastCapturedAt }: PresenceProps) {
	const [log] = useQuery(queries.positionLog());
	const now = useNow();

	return (
		<Panel testId="presence" title="Presence and position log">
			<p data-testid="ephemeral-status">
				{state.connected ? "channel connected" : "channel offline"}
			</p>

			{/*
			 * Advisory, local, never corrective and never propagated: this device's
			 * clock is odd, and only this device is told. m0-spec §8.
			 */}
			{state.clockOffsetMs !== null && (
				<p data-testid="clock-drift">
					This device's clock is {Math.round(state.clockOffsetMs / 1000)}s away
					from the server's.
				</p>
			)}

			{/*
			 * Staleness is `fixAgeMs` plus the time since the frame arrived — two
			 * elapsed durations, each measured on one clock. M0 rendered
			 * `Date.now() - capturedAt` here, which subtracts the sender's clock
			 * from the reader's and is the one operation m0-spec §7 says is never
			 * performed anywhere. m2-spec §5.
			 */}
			<ul data-testid="presence-entries">
				{state.entries.map((entry) => {
					const { ageMs } = ageOf(entry.fixAgeMs, state.entriesArrivedAt, now);
					return (
						<li
							data-testid={`presence-${entry.displayName}`}
							key={entry.playerId}
						>
							{entry.displayName} — {entry.role ?? "no role"} —{" "}
							{entry.online ? "online" : "offline"} —{" "}
							{positionLabel({
								ageMs,
								accuracyMeters: entry.fix?.accuracyMeters ?? null,
							})}
						</li>
					);
				})}
			</ul>

			<p data-testid="position-queue-size">queued: {queueSize}</p>
			<p data-testid="position-log-size">synced: {log.length}</p>
			<p data-testid="position-last-captured">
				last captured: {lastCapturedAt ?? "none"}
			</p>
			<ol data-testid="position-log-captured">
				{log.map((row) => (
					<li data-testid={`position-${row.id}`} key={row.id}>
						{row.capturedAt}
					</li>
				))}
			</ol>
		</Panel>
	);
}
