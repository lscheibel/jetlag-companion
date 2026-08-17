import { describe, expect, it } from "vitest";
import {
	ageOf,
	batteryIsWorthShowing,
	positionLabel,
	relativeAge,
	stalenessOf,
} from "./staleness";

/** The buckets in m2-spec §5, asserted rather than looked at. */
describe("stalenessOf", () => {
	it("walks the buckets in order", () => {
		expect(stalenessOf(0)).toBe("fresh");
		expect(stalenessOf(29_999)).toBe("fresh");
		expect(stalenessOf(30_000)).toBe("recent");
		expect(stalenessOf(119_999)).toBe("recent");
		expect(stalenessOf(120_000)).toBe("ageing");
		expect(stalenessOf(599_999)).toBe("ageing");
		expect(stalenessOf(600_000)).toBe("cold");
		expect(stalenessOf(3 * 3_600_000)).toBe("cold");
	});

	it("distinguishes never-seen from long-ago", () => {
		expect(stalenessOf(null)).toBe("never");
	});
});

describe("positionLabel", () => {
	it("shows accuracy alone while fresh", () => {
		expect(positionLabel({ ageMs: 5_000, accuracyMeters: 50 })).toBe("±50 m");
	});

	it("carries accuracy alongside the age while ageing", () => {
		expect(positionLabel({ ageMs: 61_000, accuracyMeters: 50 })).toBe(
			"1 min ago · ±50 m",
		);
		expect(positionLabel({ ageMs: 6 * 60_000, accuracyMeters: 50 })).toBe(
			"6 min ago · ±50 m",
		);
	});

	/**
	 * A metre figure attached to a fix that old is precision about the wrong
	 * thing, so it comes off with the position's colour. m2-spec §5.
	 */
	it("drops accuracy once the marker greys out", () => {
		expect(positionLabel({ ageMs: 43 * 60_000, accuracyMeters: 50 })).toBe(
			"last seen 43 min ago",
		);
	});

	it("says so plainly when there has never been a fix", () => {
		expect(positionLabel({ ageMs: null, accuracyMeters: null })).toBe(
			"no position",
		);
	});

	/** A network fix says its accuracy in six characters rather than a ring. */
	it("reports a terrible accuracy as a number", () => {
		expect(positionLabel({ ageMs: 1_000, accuracyMeters: 1_500 })).toBe(
			"±1500 m",
		);
	});
});

describe("relativeAge", () => {
	it("never renders a clock time", () => {
		expect(relativeAge(45_000)).toBe("<1 min ago");
		expect(relativeAge(90_000)).toBe("2 min ago");
		expect(relativeAge(43 * 60_000)).toBe("43 min ago");
		expect(relativeAge(3 * 3_600_000)).toBe("3 h ago");
	});
});

describe("ageOf", () => {
	/**
	 * The regression guard for the two-clock defect. Both terms of the sum are
	 * elapsed durations, so a device clock that is wildly wrong shifts `now` and
	 * `entriesArrivedAt` together and cancels out entirely. m2-spec §5.
	 */
	it("is the sum of two elapsed durations and nothing else", () => {
		const arrived = 1_000_000;
		expect(ageOf(4_000, arrived, arrived + 6_000).ageMs).toBe(10_000);

		const skewed = 1_000_000 + 10 * 60_000;
		expect(ageOf(4_000, skewed, skewed + 6_000).ageMs).toBe(10_000);
	});

	it("carries the bucket with it", () => {
		expect(ageOf(0, 0, 700_000).staleness).toBe("cold");
		expect(ageOf(null, 0, 700_000).ageMs).toBeNull();
	});

	/** A frame that arrives a hair in the future must not read as negative. */
	it("never goes backwards", () => {
		expect(ageOf(0, 1_000, 900).ageMs).toBe(0);
	});
});

describe("batteryIsWorthShowing", () => {
	it("inherits the fix's bucket and goes when the marker greys out", () => {
		expect(batteryIsWorthShowing("fresh", true)).toBe(true);
		expect(batteryIsWorthShowing("recent", true)).toBe(true);
		expect(batteryIsWorthShowing("ageing", true)).toBe(true);
		expect(batteryIsWorthShowing("cold", true)).toBe(false);
		expect(batteryIsWorthShowing("never", true)).toBe(false);
	});

	it("drops it the moment the phone is gone", () => {
		expect(batteryIsWorthShowing("fresh", false)).toBe(false);
	});
});
