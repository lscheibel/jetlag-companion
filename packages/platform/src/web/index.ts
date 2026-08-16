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

export const webPlatform: PlatformAdapter = {
	location,
	notifications,
	wakeLock,
	haptics,
	battery,
};
