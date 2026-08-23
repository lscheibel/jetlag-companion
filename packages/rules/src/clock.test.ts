import { describe, expect, it } from "vitest";
import { elapsed, hidingTimeRemaining, pausedMillisBefore } from "./clock";

describe("pausedMillisBefore", () => {
	it("sums closed and open pauses only up to the observation time", () => {
		expect(
			pausedMillisBefore(
				[
					{ startedAt: 110, endedAt: 120 },
					{ startedAt: 130, endedAt: null },
				],
				145,
				100,
			),
		).toBe(25);
	});

	it("ignores pauses outside the measured interval", () => {
		expect(
			pausedMillisBefore(
				[
					{ startedAt: 50, endedAt: 80 },
					{ startedAt: 210, endedAt: 220 },
				],
				200,
				100,
			),
		).toBe(0);
	});
});

describe("elapsed", () => {
	it("uses wall time when there are no pauses", () => {
		expect(elapsed(1_000, [], 1_750)).toBe(750);
	});

	it("excludes a closed pause", () => {
		expect(elapsed(1_000, [{ startedAt: 1_200, endedAt: 1_500 }], 2_000)).toBe(
			700,
		);
	});

	it("clamps an open pause to the observation time", () => {
		const pauses = [{ startedAt: 1_200, endedAt: null }];
		expect(elapsed(1_000, pauses, 1_500)).toBe(200);
		expect(elapsed(1_000, pauses, 3_000)).toBe(200);
	});

	it("counts only the part of a pause after the phase boundary", () => {
		expect(elapsed(1_000, [{ startedAt: 900, endedAt: 1_100 }], 1_500)).toBe(
			400,
		);
	});

	it("does not let a pause during hiding reduce seeking time", () => {
		expect(
			elapsed(
				2_000,
				[
					{ startedAt: 1_200, endedAt: 1_500 },
					{ startedAt: 2_200, endedAt: 2_500 },
				],
				3_000,
			),
		).toBe(700);
	});

	it("never reports negative elapsed time", () => {
		expect(elapsed(1_000, [], 900)).toBe(0);
	});
});

describe("hidingTimeRemaining", () => {
	it("subtracts the pause-aware elapsed time", () => {
		expect(
			hidingTimeRemaining(
				1_000,
				1_000,
				[{ startedAt: 1_300, endedAt: 1_500 }],
				1_800,
			),
		).toBe(400);
	});

	it("reaches zero without becoming negative", () => {
		expect(hidingTimeRemaining(1_000, 1_000, [], 2_000)).toBe(0);
		expect(hidingTimeRemaining(1_000, 1_000, [], 20_000)).toBe(0);
	});
});
