export interface PauseInterval {
	readonly startedAt: number;
	readonly endedAt: number | null;
}

/**
 * The part of every pause that intersects `[since, at]`.
 *
 * Open pauses end at `at`, which makes a clock appear frozen without storing a
 * changing total. Pauses outside the interval contribute nothing.
 */
export function pausedMillisBefore(
	pauses: readonly PauseInterval[],
	at: number,
	since = Number.NEGATIVE_INFINITY,
): number {
	if (at <= since) return 0;

	return pauses.reduce((total, pause) => {
		const start = Math.max(since, pause.startedAt);
		const end = Math.min(at, pause.endedAt ?? at);
		return total + Math.max(0, end - start);
	}, 0);
}

/** Elapsed phase time, excluding every pause that intersects the phase. */
export function elapsed(
	phaseStartedAt: number,
	pauses: readonly PauseInterval[],
	at: number,
): number {
	if (at <= phaseStartedAt) return 0;
	return Math.max(
		0,
		at - phaseStartedAt - pausedMillisBefore(pauses, at, phaseStartedAt),
	);
}

/** The hiding countdown, clamped at zero for display. */
export function hidingTimeRemaining(
	hidingDurationMillis: number,
	hidingStartedAt: number,
	pauses: readonly PauseInterval[],
	at: number,
): number {
	return Math.max(
		0,
		hidingDurationMillis - elapsed(hidingStartedAt, pauses, at),
	);
}
