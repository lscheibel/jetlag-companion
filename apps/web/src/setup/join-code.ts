import { JoinError, joinFailureMessage } from "../api";

/**
 * How long a join code is, and what may be typed into one.
 *
 * The generator lives on the server (`apps/server/src/game-log.ts`) and draws
 * from an alphabet with no I, O, 0 or 1 in it, because these codes are read out
 * loud across a platform. This side deliberately does not mirror that alphabet:
 * filtering to letters and digits is enough to keep punctuation out of the
 * boxes, and a code with an excluded character in it simply does not resolve —
 * which is the same answer, arrived at without a second copy of the rule to
 * keep in step.
 */
export const JOIN_CODE_LENGTH = 6;

export function normalizeJoinCode(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, JOIN_CODE_LENGTH);
}

/**
 * What went wrong, in words a player can act on.
 *
 * Anything that is not the server saying no is the signal: these screens are
 * used on a platform, and "check your signal" is the only useful instruction
 * when a request never arrived.
 */
export function setupFailureMessage(cause: unknown): string {
	if (cause instanceof JoinError) return joinFailureMessage(cause.reason);
	return "Could not reach the game. Check your signal and try again.";
}
