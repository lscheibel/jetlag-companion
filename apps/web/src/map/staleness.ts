/**
 * Staleness rather than confidence. m2-spec §5.
 *
 * All of this is a pure function of an age in milliseconds, so it is unit
 * tested rather than looked at. Nothing here reads a clock: the caller does the
 * arithmetic in §5 — `fixAgeMs + (Date.now() - entriesArrivedAt)` — and hands
 * the result in. Two elapsed durations, each measured on one device's own
 * clock; no absolute timestamp ever crosses a device boundary.
 */

export const FRESH_MS = 30_000;
export const RECENT_MS = 120_000;
export const AGEING_MS = 600_000;

/**
 * A marker is in exactly one of these, and a player reading the map can act on
 * the difference. m2-spec §6 draws four states out of it — online and fresh,
 * online and stale, offline, never seen — and the last of those is `never`.
 */
export type Staleness = "fresh" | "recent" | "ageing" | "cold" | "never";

export function stalenessOf(ageMs: number | null): Staleness {
	if (ageMs === null) return "never";
	if (ageMs < FRESH_MS) return "fresh";
	if (ageMs < RECENT_MS) return "recent";
	if (ageMs < AGEING_MS) return "ageing";
	return "cold";
}

/**
 * Past this, a position is a fact about the world and a battery level is a fact
 * about a phone that has been running ever since. m2-spec §7 keeps the first
 * and drops the second, and this is where that line is drawn.
 */
export function batteryIsWorthShowing(
	staleness: Staleness,
	online: boolean,
): boolean {
	// Offline drops it outright: a battery level from a phone that has been out
	// of contact for any length of time is a value that gets acted on and is
	// wrong. Otherwise it inherits the fix's bucket and goes when the marker
	// greys out.
	if (!online) return false;
	return accuracyIsWorthShowing(staleness);
}

/** Whether accuracy still says anything useful about where somebody is. */
export function accuracyIsWorthShowing(staleness: Staleness): boolean {
	return staleness !== "cold" && staleness !== "never";
}

/**
 * Always relative, at every age. m2-spec §5.
 *
 * "Last seen 43 minutes ago" is the fact a player acts on; a clock time makes
 * them do the subtraction themselves while walking. The absolute time appears
 * in the detail sheet, where somebody has stopped to read.
 */
export function relativeAge(ageMs: number): string {
	if (ageMs < 60_000) return "<1 min ago";
	const minutes = Math.round(ageMs / 60_000);
	if (minutes < 90) return `${minutes} min ago`;
	const hours = Math.round(ageMs / 3_600_000);
	return `${hours} h ago`;
}

/** `±50 m`. Six characters that a district-sized ring says badly. m2-spec §5. */
export function formatAccuracy(accuracyMeters: number): string {
	return `±${Math.round(accuracyMeters)} m`;
}

export type PositionLabelInput = {
	readonly ageMs: number | null;
	readonly accuracyMeters: number | null;
};

/**
 * What sits under a marker, one line, at every age:
 *
 * | < 30 s        | `±50 m`                |
 * | 30 s – 2 min  | `1 min ago · ±50 m`    |
 * | 2 – 10 min    | `6 min ago · ±50 m`    |
 * | > 10 min      | `last seen 43 min ago` |
 * | no fix ever   | `no position`          |
 */
export function positionLabel({
	ageMs,
	accuracyMeters,
}: PositionLabelInput): string {
	const staleness = stalenessOf(ageMs);
	if (staleness === "never" || ageMs === null) return "no position";

	const accuracy =
		accuracyMeters !== null && accuracyIsWorthShowing(staleness)
			? formatAccuracy(accuracyMeters)
			: null;

	if (staleness === "fresh") return accuracy ?? "just now";
	if (staleness === "cold") return `last seen ${relativeAge(ageMs)}`;
	return accuracy ? `${relativeAge(ageMs)} · ${accuracy}` : relativeAge(ageMs);
}

/** Absolute time, for the one surface where somebody has stopped to read it. */
export function absoluteTime(atMs: number): string {
	return new Date(atMs).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export type Aged = {
	readonly ageMs: number | null;
	readonly staleness: Staleness;
};

/**
 * The age arithmetic itself, in one place so that the two terms are visibly
 * measured on the same clock. m2-spec §5.
 */
export function ageOf(
	fixAgeMs: number | null,
	entriesArrivedAt: number,
	now: number,
): Aged {
	if (fixAgeMs === null) return { ageMs: null, staleness: "never" };
	const ageMs = Math.max(0, fixAgeMs + (now - entriesArrivedAt));
	return { ageMs, staleness: stalenessOf(ageMs) };
}
