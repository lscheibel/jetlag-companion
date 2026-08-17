/**
 * What the map is looking at. m2-spec §12.
 *
 * A discriminated union rather than two booleans, because "following" and
 * "rotating to heading" are three states and not four — there is no such thing
 * as rotating to heading while looking somewhere else.
 */
export type Camera =
	| { mode: "free" }
	/** Centre on own position. */
	| { mode: "follow" }
	/** Centre, and rotate the map to the compass heading. */
	| { mode: "followHeading" };

export const FREE: Camera = { mode: "free" };

/**
 * The recenter control cycles forward and says which mode it is in, rather
 * than being a button that silently does one of three things.
 *
 * `followHeading` is skipped where there is no compass — offered and then
 * silently equivalent to `follow` is worse than not offered. m2-spec §8.
 */
export function nextCamera(camera: Camera, hasCompass: boolean): Camera {
	if (camera.mode === "free") return { mode: "follow" };
	if (camera.mode === "follow") {
		return hasCompass ? { mode: "followHeading" } : FREE;
	}
	return FREE;
}

export function cameraLabel(camera: Camera): string {
	if (camera.mode === "free") return "Recenter";
	if (camera.mode === "follow") return "Following";
	return "Following · compass";
}
