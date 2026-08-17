import type { BatteryState, PositionSnapshot } from "@zero-lag/schema";
import {
	AVAILABLE,
	type Capability,
	type LocalNotification,
	type LocationOpts,
	type PermissionOutcome,
	type PlatformAdapter,
	type Release,
	type Unsubscribe,
	unavailableFix,
} from "../index";

/**
 * The web implementation. This file, and its siblings under
 * `packages/platform`, are the only places in the repo permitted to touch
 * `navigator.*` and `Notification` — enforced by `noRestrictedGlobals` in
 * biome.json, because an unenforced adapter decays into a wrapper that half the
 * app bypasses, and then it has bought nothing. m0-spec §10.
 */

type BatteryManager = {
	level: number;
	charging: boolean;
};

type NavigatorWithExtras = Navigator & {
	getBattery?: () => Promise<BatteryManager>;
};

type UnavailableReason = Extract<Capability, { available: false }>["reason"];

function unsupported(reason: UnavailableReason): Capability {
	return { available: false, reason };
}

function toSnapshot(position: GeolocationPosition): PositionSnapshot {
	const { coords } = position;
	return {
		lng: coords.longitude,
		lat: coords.latitude,
		accuracyMeters: coords.accuracy,
		headingDeg: Number.isFinite(coords.heading) ? coords.heading : null,
		speedMps: Number.isFinite(coords.speed) ? coords.speed : null,
		// The device's own clock, which is the staleness reference everywhere.
		capturedAt: position.timestamp,
		source: coords.accuracy <= 100 ? "gps" : "network",
		receivedAt: null,
	};
}

function positionOptions(opts?: LocationOpts): PositionOptions {
	return {
		enableHighAccuracy: opts?.enableHighAccuracy ?? true,
		timeout: opts?.timeoutMs ?? 15_000,
		maximumAge: opts?.maximumAgeMs ?? 5_000,
	};
}

const location: PlatformAdapter["location"] = {
	capability() {
		if (typeof window === "undefined") return unsupported("unsupported");
		if (!window.isSecureContext) return unsupported("insecure_context");
		if (!("geolocation" in navigator)) return unsupported("unsupported");
		return AVAILABLE;
	},

	/**
	 * Always resolves. A denial or a timeout is an answer — `source:
	 * 'unavailable'` — not an exception, because every caller of this has to
	 * carry on regardless and the record should say plainly that there was no fix.
	 */
	getCurrent(opts) {
		if (!location.capability().available) {
			return Promise.resolve(unavailableFix());
		}
		return new Promise<PositionSnapshot>((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(position) => resolve(toSnapshot(position)),
				() => resolve(unavailableFix()),
				positionOptions(opts),
			);
		});
	},

	watch(cb, opts): Unsubscribe {
		if (!location.capability().available) {
			cb(unavailableFix());
			return () => {};
		}
		const id = navigator.geolocation.watchPosition(
			(position) => cb(toSnapshot(position)),
			() => cb(unavailableFix()),
			positionOptions(opts),
		);
		return () => navigator.geolocation.clearWatch(id);
	},
};

type CompassEvent = DeviceOrientationEvent & {
	/** Safari's own, already in compass degrees. */
	readonly webkitCompassHeading?: number;
};

type OrientationConstructor = typeof DeviceOrientationEvent & {
	/** iOS 13+ only, and only callable from a user gesture. */
	requestPermission?: () => Promise<PermissionOutcome>;
};

/**
 * `alpha` is a compass bearing only when the reading is absolute.
 *
 * A relative `alpha` is measured from wherever the device happened to be when
 * the sensor started, so it tracks a real bearing closely enough to look right
 * and is not one. Rendering it would be inferring north from a number that
 * merely correlates with it, so a non-absolute reading is dropped instead.
 */
function compassHeadingOf(event: CompassEvent): number | null {
	if (typeof event.webkitCompassHeading === "number") {
		return event.webkitCompassHeading;
	}
	if (!event.absolute || event.alpha === null) return null;
	// `alpha` counts anticlockwise from east-north-east zero; a compass counts
	// clockwise from north.
	return (360 - event.alpha) % 360;
}

const orientation: PlatformAdapter["orientation"] = {
	capability() {
		if (typeof window === "undefined") return unsupported("unsupported");
		if (typeof DeviceOrientationEvent === "undefined") {
			return unsupported("unsupported");
		}
		// Whether a compass exists behind the API is not knowable synchronously —
		// a desktop browser defines the event and never fires it. The UI treats an
		// available capability that produces no reading as no compass either way,
		// which is why `watch` never reports a null heading.
		return AVAILABLE;
	},

	watch(cb): Unsubscribe {
		if (!orientation.capability().available) return () => {};

		let live = true;
		const handler = (event: Event) => {
			if (!live) return;
			const heading = compassHeadingOf(event as CompassEvent);
			if (heading !== null) cb(heading);
		};

		const listen = () => {
			if (!live) return;
			// `deviceorientationabsolute` is the one that promises north. Chrome on
			// Android fires only that one; Safari fires `deviceorientation` with its
			// own compass field. Both are attached and `compassHeadingOf` decides.
			window.addEventListener("deviceorientationabsolute", handler);
			window.addEventListener("deviceorientation", handler);
		};

		const orientationEvent = DeviceOrientationEvent as OrientationConstructor;
		if (typeof orientationEvent.requestPermission === "function") {
			// iOS. Granted only when this call happens inside a user gesture, which
			// is why the map asks for a heading from the control the player taps
			// rather than on mount.
			void orientationEvent
				.requestPermission()
				.then((outcome) => {
					if (outcome === "granted") listen();
				})
				.catch(() => {});
		} else {
			listen();
		}

		return () => {
			live = false;
			window.removeEventListener("deviceorientationabsolute", handler);
			window.removeEventListener("deviceorientation", handler);
		};
	},
};

const notifications: PlatformAdapter["notifications"] = {
	capability() {
		if (typeof Notification === "undefined") return unsupported("unsupported");
		if (Notification.permission === "denied") return unsupported("denied");
		return AVAILABLE;
	},

	async requestPermission(): Promise<PermissionOutcome> {
		if (typeof Notification === "undefined") return "denied";
		return Notification.requestPermission();
	},

	async show(notification: LocalNotification): Promise<void> {
		if (!notifications.capability().available) return;
		if (Notification.permission !== "granted") return;
		new Notification(notification.title, {
			body: notification.body,
			tag: notification.tag,
			silent: notification.silent,
		});
	},
};

const wakeLock: PlatformAdapter["wakeLock"] = {
	capability() {
		if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
			return unsupported("unsupported");
		}
		return AVAILABLE;
	},

	async acquire(): Promise<Release> {
		if (!wakeLock.capability().available) {
			return async () => {};
		}
		try {
			const sentinel = await navigator.wakeLock.request("screen");
			return () => sentinel.release();
		} catch {
			// A wake lock is refused whenever the page is not visible, which is a
			// normal thing to happen rather than an error worth surfacing.
			return async () => {};
		}
	},
};

const haptics: PlatformAdapter["haptics"] = {
	capability() {
		if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
			return unsupported("unsupported");
		}
		return AVAILABLE;
	},

	vibrate(pattern: number[]): void {
		if (!haptics.capability().available) return;
		navigator.vibrate(pattern);
	},
};

const battery: PlatformAdapter["battery"] = {
	/**
	 * The immediate case for capabilities being a first-class state: the Battery
	 * Status API is unimplemented in several browsers, so M2's per-player battery
	 * display is *already* a partial feature on day one.
	 */
	capability() {
		if (typeof navigator === "undefined") return unsupported("unsupported");
		const extended = navigator as NavigatorWithExtras;
		if (typeof extended.getBattery !== "function") {
			return unsupported("unsupported");
		}
		return AVAILABLE;
	},

	async read(): Promise<BatteryState | null> {
		const extended =
			typeof navigator === "undefined"
				? null
				: (navigator as NavigatorWithExtras);
		if (!extended || typeof extended.getBattery !== "function") return null;
		try {
			const manager = await extended.getBattery();
			return { level: manager.level, charging: manager.charging };
		} catch {
			return null;
		}
	},
};

const clipboard: PlatformAdapter["clipboard"] = {
	capability() {
		if (typeof navigator === "undefined" || !("clipboard" in navigator)) {
			return unsupported("unsupported");
		}
		// The API exists only in a secure context, and a game set up over a plain
		// http:// LAN address is a real way to meet this.
		return AVAILABLE;
	},

	async write(text: string): Promise<boolean> {
		if (!clipboard.capability().available) return false;
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Permission refused, or no user gesture. The caller says so plainly.
			return false;
		}
	},
};

export const webPlatform: PlatformAdapter = {
	location,
	orientation,
	notifications,
	wakeLock,
	haptics,
	battery,
	clipboard,
};
