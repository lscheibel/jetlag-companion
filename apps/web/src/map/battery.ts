import type { BatteryState } from "@zero-lag/schema";
import type { IconName } from "@zero-lag/ui/components/icon";

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
	return `${Math.round(battery.level * 100)}%`;
}

/**
 * The cell drawn at the level it is reporting, or the charging bolt over it.
 *
 * Charging wins over the level, because it is the fact that changes what the
 * number means: forty per cent and falling is a phone to worry about, and forty
 * per cent on a cable is not. It used to be a `⚡` glued to the end of the
 * string — the only emoji in the app outside a team's own mark.
 *
 * Null where there is nothing to draw, which is the same condition that makes
 * `formatBattery` say "unavailable": an icon beside those two words would be a
 * picture of a fact that is not there.
 */
export function batteryGlyph(battery: BatteryState | null): IconName | null {
	if (!battery || battery.level === null) return null;
	if (battery.charging) return "battery-charging";
	if (battery.level >= 0.9) return "battery-full";
	if (battery.level >= 0.6) return "battery-high";
	if (battery.level >= 0.35) return "battery-medium";
	if (battery.level >= 0.1) return "battery-low";
	return "battery-empty";
}
