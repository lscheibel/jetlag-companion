import { describe, expect, it } from "vitest";
import { BATTERY_UNAVAILABLE, batteryGlyph, formatBattery } from "./battery";

describe("formatBattery", () => {
	it("rounds a reading to whole percent", () => {
		expect(formatBattery({ level: 0.624, charging: false })).toBe("62%");
		expect(formatBattery({ level: 1, charging: true })).toBe("100%");
	});

	/** Three states and never two, and never a fourth. m2-spec §7. */
	it("says unavailable rather than inventing a level", () => {
		expect(formatBattery(null)).toBe(BATTERY_UNAVAILABLE);
		expect(formatBattery({ level: null, charging: null })).toBe(
			BATTERY_UNAVAILABLE,
		);
	});
});

describe("batteryGlyph", () => {
	it("draws the cell at the level it is reporting", () => {
		expect(batteryGlyph({ level: 1, charging: false })).toBe("battery-full");
		expect(batteryGlyph({ level: 0.85, charging: false })).toBe("battery-high");
		expect(batteryGlyph({ level: 0.5, charging: false })).toBe(
			"battery-medium",
		);
		expect(batteryGlyph({ level: 0.2, charging: false })).toBe("battery-low");
		expect(batteryGlyph({ level: 0.03, charging: false })).toBe(
			"battery-empty",
		);
	});

	/** On a cable, the level is no longer the fact worth drawing. */
	it("prefers charging to the level", () => {
		expect(batteryGlyph({ level: 0.05, charging: true })).toBe(
			"battery-charging",
		);
		expect(batteryGlyph({ level: 0.99, charging: true })).toBe(
			"battery-charging",
		);
	});

	it("draws nothing where there is no reading", () => {
		expect(batteryGlyph(null)).toBeNull();
		expect(batteryGlyph({ level: null, charging: true })).toBeNull();
	});
});
