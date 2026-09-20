import { AGEING_MS, relativeAge } from "./staleness";

/**
 * Where this phone's position is coming from, right now. m15-spec §6.
 *
 * Two independent things can report a position for one player, and they fail in
 * completely different ways: the browser's watch stops when the screen locks,
 * and a tracker app stops when its battery saver eats it or its URL was pasted
 * wrong. A player who only sees "no position" cannot tell which of those
 * happened, and the fix for one is not the fix for the other.
 */
export type PositionSourceKind = "both" | "browser" | "tracker" | "none";

export interface PositionSourceInput {
	/** The local `watchPosition` has a usable fix — not a denial or a timeout. */
	readonly hasBrowserFix: boolean;
	/**
	 * How long since the tracking webhook last heard from this device, or null
	 * if it never has — including when no tracking token exists at all.
	 */
	readonly trackerAgeMs: number | null;
}

/**
 * A tracker counts as reporting until its last ping goes cold.
 *
 * The threshold is m2-spec §5's own `AGEING_MS` rather than a new number: past
 * ten minutes a marker is already drawn as cold, and a screen that called the
 * tracker "live" while the map called its position stale would be two answers
 * to one question. Trackers report on their own schedule — OsmAnd's interval is
 * configurable up to five minutes — so anything tighter would flicker.
 */
export function trackerIsReporting(trackerAgeMs: number | null): boolean {
	return trackerAgeMs !== null && trackerAgeMs < AGEING_MS;
}

/**
 * How long since the last ping, in the words every screen that says it uses.
 *
 * Seconds under a minute, because the moment this matters most is the one just
 * after a player finished setup in another app and came back to find out
 * whether it took — and "<1 min ago" is not an answer to that.
 */
export function trackerAgeLabel(ageMs: number): string {
	const seconds = Math.round(ageMs / 1_000);
	return seconds < 60 ? `${seconds} s ago` : relativeAge(ageMs);
}

export function positionSourceOf({
	hasBrowserFix,
	trackerAgeMs,
}: PositionSourceInput): PositionSourceKind {
	const tracker = trackerIsReporting(trackerAgeMs);
	if (hasBrowserFix && tracker) return "both";
	if (hasBrowserFix) return "browser";
	if (tracker) return "tracker";
	return "none";
}

/**
 * What each state means, in the terms a player would act on.
 *
 * The headline names the source; the detail says what happens next, because
 * that is the actual question — "will my team still see me when I put this in
 * my pocket" — and it has a different answer in all four states.
 */
export function positionSourceCopy(kind: PositionSourceKind): {
	readonly title: string;
	readonly detail: string;
} {
	if (kind === "both") {
		return {
			title: "Browser and tracker",
			detail:
				"Both are reporting. Your team keeps seeing you when you lock the screen.",
		};
	}
	if (kind === "browser") {
		return {
			title: "This browser only",
			detail:
				"Your team sees you while this page is open. Lock the screen or switch apps and your position stops until you come back.",
		};
	}
	if (kind === "tracker") {
		return {
			title: "Tracker only",
			detail:
				"Your tracker app is reporting, so your team can see you — but this page cannot read a location itself, so your own map has nothing to centre on.",
		};
	}
	return {
		title: "Nothing is reporting",
		detail: "Nobody can see where you are, and this map cannot centre on you.",
	};
}
