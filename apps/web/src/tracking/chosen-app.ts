/**
 * Which tracker app this phone uses. m15-spec §6.
 *
 * Device-scoped, like the token it goes with: a phone runs OwnTracks or it runs
 * OsmAnd, and that is true of every game it plays. Storing it means a player
 * coming back to this screen sees what their phone is set up with rather than
 * being asked to pick again — the same argument the briefing-seen flag makes,
 * which is that whether somebody has answered a question is not game state.
 *
 * It is a preference and nothing depends on it: a phone that refuses storage
 * starts the flow at step one, which is where it started anyway.
 */
const KEY = "zero-lag.tracker.app";

export function readChosenAppId(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function writeChosenAppId(appId: string): void {
	try {
		localStorage.setItem(KEY, appId);
	} catch {
		// A browser refusing storage is not a reason to refuse the choice; it
		// just will not survive a reload.
	}
}
