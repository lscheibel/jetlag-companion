import { useEffect, useState } from "react";

/** Coarse enough that twenty markers re-labelling is nothing, fine enough that
 * a 30-second bucket boundary is never visibly late. */
const TICK_MS = 5_000;

/**
 * The clock, as an external system.
 *
 * Ages are derived during render from this and never stored per player — a
 * marker's staleness is a function of one number, so there is exactly one piece
 * of state behind every label on the screen.
 */
export function useNow(intervalMs: number = TICK_MS): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);

	return now;
}
