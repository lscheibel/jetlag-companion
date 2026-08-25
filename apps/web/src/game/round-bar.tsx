import { useQuery } from "@rocicorp/zero/react";
import { elapsed } from "@zero-lag/rules";
import { queries } from "@zero-lag/schema";
import { useNow } from "../map/use-now";

interface RoundBarProps {
	clockOffsetMs?: number | null;
}

export function RoundBar({ clockOffsetMs = 0 }: RoundBarProps) {
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const now = useNow(1_000) + (clockOffsetMs ?? 0);
	const round =
		[...rounds].reverse().find((value) => value.status !== "ended") ??
		rounds.at(-1);

	if (!round) return null;
	const roundPauses = pauses.filter((pause) => pause.roundId === round.id);
	const openPause = roundPauses.find((pause) => pause.endedAt === null);
	let readout = "Waiting to start";
	if (round.status === "hiding" && round.hidingStartedAt !== null) {
		const remaining = Math.max(
			0,
			round.hidingDurationMs - elapsed(round.hidingStartedAt, roundPauses, now),
		);
		readout =
			remaining === 0 ? "Hiding time is up" : `${formatHms(remaining)} left`;
	} else if (round.status === "seeking" && round.seekingStartedAt !== null) {
		readout = formatHms(elapsed(round.seekingStartedAt, roundPauses, now));
	} else if (round.status === "ended") {
		readout = "Round ended";
	}

	return (
		<div className="flex shrink-0 items-center gap-1.5" data-testid="round-bar">
			<span className="sr-only" data-testid="round-phase">
				{round.status}
			</span>
			<span
				className="shrink-0 rounded-[14px] bg-action px-2.5 py-1 text-right font-bold font-mono text-[0.6rem] text-action-ink uppercase tracking-[0.06em]"
				data-testid="round-clock"
			>
				{readout}
			</span>
			{openPause && (
				<span
					className="rounded-[14px] bg-stale/20 px-2 py-1 text-stale text-xs"
					data-testid="round-paused"
				>
					Paused: {openPause.reason}
				</span>
			)}
		</div>
	);
}

/** Always hours, minutes and seconds. The hiding countdown is `hh:mm:ss left`. */
export function formatHms(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const remainder = seconds % 60;
	return `${hours.toString().padStart(2, "0")}:${minutes
		.toString()
		.padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function formatClock(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const remainder = seconds % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remainder
			.toString()
			.padStart(2, "0")}`;
	}
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
