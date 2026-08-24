/**
 * Whether this person has read the briefing for this game.
 *
 * Local to the device on purpose. Whether somebody has *seen* a screen is not
 * game state — nobody else can act on it, it does not belong in the event log,
 * and a column for it would be a column the rest of the app has to reason
 * about. What is game state is what they said afterwards, and that is `readyAt`.
 */

const KEY = "zero-lag.briefingSeen";

export function hasSeenBriefing(gameId: string, playerId: string): boolean {
	try {
		return localStorage.getItem(KEY) === mark(gameId, playerId);
	} catch {
		return false;
	}
}

export function markBriefingSeen(gameId: string, playerId: string): void {
	try {
		localStorage.setItem(KEY, mark(gameId, playerId));
	} catch {
		// A phone with storage disabled reads the briefing again. That is the
		// worst this can do, and it is not worth handling.
	}
}

function mark(gameId: string, playerId: string): string {
	return `${gameId}:${playerId}`;
}
