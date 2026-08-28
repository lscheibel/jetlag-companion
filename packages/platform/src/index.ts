import type { BatteryState, PositionSnapshot } from "@zero-lag/schema";

/**
 * One interface, one web implementation, one lint rule. m0-spec §10.
 *
 * Background location and reliable push are not deliverable in a browser at
 * all, and are the reason a Capacitor build will eventually exist. Keeping them
 * behind this interface is what makes that build a second implementation rather
 * than a rewrite.
 */

export type Capability =
	| { readonly available: true }
	| {
			readonly available: false;
			readonly reason:
				| "unsupported"
				| "denied"
				| "insecure_context"
				| "unavailable";
	  };

export const AVAILABLE: Capability = { available: true };

export type Unsubscribe = () => void;
export type Release = () => Promise<void>;

export type LocationOpts = {
	readonly enableHighAccuracy?: boolean;
	readonly timeoutMs?: number;
	readonly maximumAgeMs?: number;
};

export type LocalNotification = {
	readonly title: string;
	readonly body?: string;
	readonly tag?: string;
	readonly silent?: boolean;
};

/**
 * What asking for notification permission produced.
 *
 * These are the browser's own three values on purpose. "default" is the
 * dismissed-without-choosing case — neither a grant nor a refusal, and the
 * only one of the three where asking again is permitted. Folding it into
 * "denied" would lose exactly the distinction a caller needs to decide whether
 * a second prompt is worth offering. A Capacitor implementation maps its
 * native result onto these, not the other way round.
 */
export type PermissionOutcome = "default" | "denied" | "granted";

export type LocationIssue =
	| "denied"
	| "no_fix"
	| "unsupported"
	| "insecure_context";

export interface PlatformAdapter {
	readonly location: {
		capability(): Capability;
		getCurrent(opts?: LocationOpts): Promise<PositionSnapshot>;
		watch(
			cb: (fix: PositionSnapshot) => void,
			opts?: LocationOpts,
		): Unsubscribe;
		/** Why the last read failed, or null after a usable fix. */
		issue(): LocationIssue | null;
	};
	/**
	 * Which way the phone is facing. m2-spec §8.
	 *
	 * The compass, and only the compass. `PositionSnapshot.headingDeg` is course
	 * over ground — null whenever a phone is standing still, which is exactly
	 * when somebody at a station exit needs to know which way to walk — so the
	 * two are different questions and this is the one M2 asks.
	 *
	 * The callback takes a number rather than a nullable one on purpose: "no
	 * heading" is the absence of the capability, not a null reading inside it. A
	 * device with no compass never calls back, and nothing is rendered.
	 */
	readonly orientation: {
		capability(): Capability;
		watch(cb: (headingDeg: number) => void): Unsubscribe;
	};
	readonly notifications: {
		capability(): Capability;
		requestPermission(): Promise<PermissionOutcome>;
		show(notification: LocalNotification): Promise<void>;
	};
	readonly wakeLock: {
		capability(): Capability;
		acquire(): Promise<Release>;
	};
	readonly haptics: {
		capability(): Capability;
		vibrate(pattern: number[]): void;
	};
	readonly battery: {
		capability(): Capability;
		read(): Promise<BatteryState | null>;
	};
	/**
	 * Sharing a join link. m1-spec §8.
	 *
	 * `write` reports whether it worked rather than throwing, because the browser
	 * can refuse and a "Copied" label that lies is worse than one that admits it
	 * did not. A Capacitor build reaches the system clipboard instead, which is
	 * exactly the substitution this interface exists for.
	 */
	readonly clipboard: {
		capability(): Capability;
		write(text: string): Promise<boolean>;
		/** The system clipboard, or null when the browser refuses the read. */
		read(): Promise<string | null>;
	};
	/**
	 * Handing the link to whatever the phone can hand it to. m1-spec §8.
	 *
	 * Reports whether the sheet opened, not whether anybody was sent anything:
	 * the platform never says where a share went, and a caller that pretended
	 * otherwise would be guessing. Unavailable on most desktop browsers, which
	 * is why copying is beside it rather than behind it.
	 */
	readonly share: {
		capability(): Capability;
		open(input: { url: string; title?: string }): Promise<boolean>;
	};
}

/**
 * The honest answer when there is no fix.
 *
 * `source: 'unavailable'` is first-class: a hider with location services off
 * must be able to answer, and the record should say plainly that there was no
 * fix rather than omit the field. When `source` is `'unavailable'` the
 * coordinates carry no meaning — read them through `fixToLngLat`, which returns
 * null, rather than off the object.
 */
export function unavailableFix(capturedAt = Date.now()): PositionSnapshot {
	return {
		lng: 0,
		lat: 0,
		accuracyMeters: 0,
		headingDeg: null,
		speedMps: null,
		capturedAt,
		source: "unavailable",
		receivedAt: null,
	};
}
