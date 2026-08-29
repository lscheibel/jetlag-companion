import { type Region, regionContains } from "@zero-lag/geo";
import type { SearchableStop } from "./toolkit";

/**
 * A stop the fold still allows: inside the game area, and inside the surviving
 * search area when one is on screen. Seekers only — hiders must not see a cut
 * as a missing station.
 */
export function stopInNarrowedArea(
	stop: SearchableStop,
	fold: Region | null,
): boolean {
	if (!stop.insideArea) return false;
	if (!fold) return true;
	return regionContains(fold, [stop.lng, stop.lat]);
}

/** How many in-play stations the surviving fold still contains. */
export function remainingStopCount(
	stops: readonly SearchableStop[],
	fold: Region | null,
): number {
	let count = 0;
	for (const stop of stops) {
		if (stopInNarrowedArea(stop, fold)) count += 1;
	}
	return count;
}
