import { useCallback, useState } from "react";

/**
 * The hider's self-imposed blindness. m2-spec §9.
 *
 * Local, and that is the entire specification: `localStorage` per game, never
 * sent, never recorded, no event, no mutator, no column. It is a fact about how
 * one person wants to use their phone, not a fact about the game — the same
 * shape as m0-spec §5's "you have left your hiding zone" nudge.
 */
function keyFor(gameId: string): string {
	return `zero-lag.blind.${gameId}`;
}

function read(gameId: string): boolean {
	try {
		return localStorage.getItem(keyFor(gameId)) === "on";
	} catch {
		return false;
	}
}

export interface Blindness {
	readonly blind: boolean;
	toggle(): void;
}

export function useBlindness(gameId: string): Blindness {
	// Read once per mount rather than on every render, and written straight
	// through on toggle: `localStorage` is an external store, and there is
	// nothing else in the app that writes this key.
	const [blind, setBlind] = useState(() => read(gameId));

	const toggle = useCallback(() => {
		setBlind((current) => {
			const next = !current;
			try {
				if (next) localStorage.setItem(keyFor(gameId), "on");
				else localStorage.removeItem(keyFor(gameId));
			} catch {
				// A browser refusing storage is not a reason to refuse the toggle; it
				// just will not survive a reload.
			}
			return next;
		});
	}, [gameId]);

	return { blind, toggle };
}
