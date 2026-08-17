import { webPlatform } from "@zero-lag/platform/web";
import { useEffect } from "react";
import type { EphemeralChannel } from "../ephemeral";

/**
 * The wire that M0 laid and never connected. m2-spec §7.
 *
 * `EphemeralChannel.sendBattery` existed, the server handled `batt`, and
 * `PresenceEntry.battery` was on the wire — and nothing in the app ever called
 * any of it. That is invisible until a milestone displays the value, and this
 * is that milestone.
 *
 * Read on mount and on the sampling interval; re-announced on connect by the
 * channel itself, alongside the position.
 */
export function useBatteryBroadcast(
	channel: EphemeralChannel | null,
	intervalMs: number,
): void {
	// The Battery Status API is an external system, and one this app only ever
	// pushes outward — there is nothing to derive during render.
	useEffect(() => {
		if (!channel) return;
		let live = true;

		const report = async () => {
			const battery = await webPlatform.battery.read();
			if (!live) return;
			// A refusal and an unimplemented API are the same answer, and it is
			// still an answer: `{ level: null }` renders as "battery unavailable"
			// rather than as a value nobody has.
			channel.sendBattery(battery ?? { level: null, charging: null });
		};

		void report();
		const timer = setInterval(() => void report(), intervalMs);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [channel, intervalMs]);
}
