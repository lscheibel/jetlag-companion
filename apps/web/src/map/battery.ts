import type { BatteryState } from "@zero-lag/schema";

/**
 * Three states and never two. m2-spec §7.
 *
 * A reading, or an honest "unavailable" — which covers both a browser without
 * the Battery Status API and one that has it and refused. There is deliberately
 * no fourth state for "we knew once": a stale battery percentage is worse than
 * none, because it gets acted on. Dropping it altogether is the caller's job
 * (`batteryIsWorthShowing`), and this function never invents a value.
 */
export const BATTERY_UNAVAILABLE = "battery unavailable";

export function formatBattery(battery: BatteryState | null): string {
	if (!battery || battery.level === null) return BATTERY_UNAVAILABLE;
	const percent = `${Math.round(battery.level * 100)}%`;
	return battery.charging ? `${percent} ⚡` : percent;
}
