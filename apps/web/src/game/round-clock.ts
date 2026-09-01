import { elapsed, type PauseInterval } from "@zero-lag/rules";
import type { RoundStatus } from "@zero-lag/schema";

/**
 * What the round's clocks say, and nothing about how they are drawn.
 *
 * Everything here is derived from the two instants on the round and the pause
 * intervals beside them — m5-spec §8's "every live clock is derived". It lives
 * apart from the bar because the correction sheet reads the same functions,
 * and a sheet importing the component that renders it is a cycle waiting to
 * pick a side.
 */

/** The phase whose clock is counting, and the instant it counts from. */
export interface RunningClock {
	readonly phase: "hiding" | "seeking";
	readonly startedAt: number;
}

/**
 * The clock that is currently running, or null when none is.
 *
 * A phase with no start instant is not running even though its status says so:
 * there is nothing to count from, and every readout below would be a number
 * derived from `null`.
 */
export function runningClock(round: {
	readonly status: RoundStatus;
	readonly hidingStartedAt: number | null;
	readonly seekingStartedAt: number | null;
}): RunningClock | null {
	if (round.status === "hiding" && round.hidingStartedAt !== null) {
		return { phase: "hiding", startedAt: round.hidingStartedAt };
	}
	if (round.status === "seeking" && round.seekingStartedAt !== null) {
		return { phase: "seeking", startedAt: round.seekingStartedAt };
	}
	return null;
}

/**
 * What a running clock reads at `at`.
 *
 * `startedAt` is a parameter rather than read back off the round, so the
 * correction sheet can show what a draft *would* read without writing it
 * first — and so the preview and the bar can never be two renderings of the
 * same phase that disagree.
 */
export function clockReadout(
	phase: RunningClock["phase"],
	startedAt: number,
	hidingDurationMs: number,
	pauses: readonly PauseInterval[],
	at: number,
): string {
	if (phase === "seeking") return formatHms(elapsed(startedAt, pauses, at));
	const remaining = Math.max(
		0,
		hidingDurationMs - elapsed(startedAt, pauses, at),
	);
	return remaining === 0 ? "Hiding time is up" : `${formatHms(remaining)} left`;
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
