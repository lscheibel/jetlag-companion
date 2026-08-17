import { webPlatform } from "@zero-lag/platform/web";
import { useEffect, useState } from "react";

/**
 * Which way this phone is facing, or null. m2-spec §8.
 *
 * Null means there is no compass, and the map renders no orientation at all —
 * no arrow, and no `followHeading` mode offered. There is deliberately no
 * fallback to `PositionSnapshot.headingDeg`: course over ground vanishes when a
 * player stands still, which is exactly when somebody at a station exit needs
 * to know which way to walk, and an arrow that disappears and then reappears
 * pointing backwards is worse than no arrow.
 *
 * Derived from a reading rather than from `capability()`, because the capability
 * cannot know synchronously whether a compass is behind the API — a desktop
 * browser defines `DeviceOrientationEvent` and never fires it. A heading that
 * has actually arrived is the only honest evidence there is one.
 */
export function useCompassHeading(): number | null {
	const [heading, setHeading] = useState<number | null>(null);

	// A sensor is an external system, which is what `useEffect` is for.
	useEffect(() => {
		return webPlatform.orientation.watch(setHeading);
	}, []);

	return heading;
}
