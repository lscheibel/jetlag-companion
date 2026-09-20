import { useEffect, useState } from "react";

/**
 * A server-measured age, counted up from locally. m0-spec §7.
 *
 * The two terms are `ageMs` (measured on the server, at the moment it answered)
 * and the time this screen has been looking at it (measured here). Neither
 * crosses a clock boundary, and the second only ticks while `live` — a timer
 * behind a closed sheet is a re-render a second for nothing.
 */
export function useCountingAge(
	ageMs: number | null,
	readAt: number,
	live: boolean,
): number | null {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!live) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(timer);
	}, [live]);

	if (ageMs === null) return null;
	return Math.max(0, ageMs + (now - readAt));
}
