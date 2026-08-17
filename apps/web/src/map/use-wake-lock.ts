import { webPlatform } from "@zero-lag/platform/web";
import { useEffect } from "react";

/**
 * One of the two honest things M2 can do about the screen-lock problem.
 * m2-spec §10.
 *
 * Browser geolocation stops when the screen locks, and no amount of care here
 * changes that — the build plan says a Capacitor build is the answer and puts it
 * at M15. Holding the screen awake while the map is open during a running round
 * keeps a phone in a pocket-free hand reporting; the other honest thing is
 * saying so on screen, which `MapControls` does.
 *
 * `wakeLock` has been defined since M0 and used by nothing. This is the first
 * caller.
 */
export function useWakeLock(active: boolean): void {
	useEffect(() => {
		if (!active) return;
		let released = false;
		let release: (() => Promise<void>) | null = null;

		void webPlatform.wakeLock.acquire().then((got) => {
			// The effect may already have been cleaned up by the time the browser
			// answers; releasing immediately is the correct response, not an error.
			if (released) {
				void got();
				return;
			}
			release = got;
		});

		return () => {
			released = true;
			void release?.();
		};
	}, [active]);
}
