import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNow } from "../map/use-now";
import { clockReadout, runningClock } from "./round-clock";
import { TimerSheet } from "./timer-sheet";

const CLOCK_PILL =
	"shrink-0 rounded-[14px] bg-action px-2.5 py-1 text-center font-bold font-mono text-[0.6rem] text-action-ink uppercase tracking-[0.06em]";

export function RoundBar() {
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const [correcting, setCorrecting] = useState(false);
	/**
	 * This device's own clock, uncorrected.
	 *
	 * `ephemeral.clockOffsetMs` used to be added here, and it is what froze
	 * this readout at the full duration. The server derives that number from
	 * `fix.capturedAt` — the instant a *GPS fix* was taken, not what the phone
	 * thinks the time is — and the channel re-offers one held fix every two
	 * seconds, so a phone standing still normally presents a fix minutes old.
	 * The server reads the fix's age as clock skew, and adding it here drags
	 * `now` back behind `hidingStartedAt`, which pins `elapsed` at zero.
	 *
	 * It is advisory by construction — "never corrective", says the server that
	 * sends it — and `presence.tsx` still shows it to the one device it is
	 * about. `start-seeking.tsx` never applied it, so this also ends a
	 * disagreement between two renderings of the same countdown.
	 */
	const now = useNow(1_000);
	const round =
		[...rounds].reverse().find((value) => value.status !== "ended") ??
		rounds.at(-1);

	if (!round) return null;
	const roundPauses = pauses.filter((pause) => pause.roundId === round.id);
	const openPause = roundPauses.find((pause) => pause.endedAt === null);
	const clock = runningClock(round);
	const readout = clock
		? clockReadout(
				clock.phase,
				clock.startedAt,
				round.hidingDurationMs,
				roundPauses,
				now,
			)
		: round.status === "ended"
			? "Round ended"
			: "Waiting to start";

	return (
		<div className="flex shrink-0 items-center gap-1.5" data-testid="round-bar">
			<span className="sr-only" data-testid="round-phase">
				{round.status}
			</span>
			{/* A clock that is running is the way into correcting it; one that is
			    not is a label, and a label that depresses under a thumb and does
			    nothing is worse than one that cannot be pressed. */}
			{clock ? (
				<button
					aria-label={`${readout}. Correct the ${clock.phase} clock`}
					className={cn(
						CLOCK_PILL,
						"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-95",
					)}
					data-testid="round-clock"
					onClick={() => setCorrecting(true)}
					type="button"
				>
					{readout}
				</button>
			) : (
				<span className={CLOCK_PILL} data-testid="round-clock">
					{readout}
				</span>
			)}
			{openPause && (
				<span
					className="rounded-[14px] bg-stale/20 px-2 py-1 text-stale text-xs"
					data-testid="round-paused"
				>
					Paused: {openPause.reason}
				</span>
			)}
			{/*
			 * Portalled out of the header.
			 *
			 * The bar renders inside `ScreenHeader`, which is `z-20` — and a
			 * z-index makes a stacking context, so a `fixed z-50` sheet nested
			 * inside it cannot rise above a later `z-20` sibling like the map's
			 * hider card. LobbyChrome already hoists its own two sheets out of
			 * the header for the same reason; a portal does it without making
			 * every screen that shows a clock remember to.
			 */}
			{typeof document !== "undefined" &&
				createPortal(
					<TimerSheet
						onClose={() => setCorrecting(false)}
						open={correcting}
						roundId={round.id}
					/>,
					document.body,
				)}
		</div>
	);
}
