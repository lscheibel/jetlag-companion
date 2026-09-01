import { describe, expect, it } from "vitest";
import {
	clampStart,
	resolveTimeInput,
	startProblem,
	steppedStart,
} from "./timer-sheet";

const MINUTE = 60_000;

/** A fixed local wall time to reason about: 2026-09-01, 16:04:30. */
const NOW = new Date(2026, 8, 1, 16, 4, 30).getTime();

describe("steppedStart", () => {
	it("adds to a countdown by moving its start later", () => {
		expect(steppedStart(NOW, "hiding", 5)).toBe(NOW + 5 * MINUTE);
		expect(steppedStart(NOW, "hiding", -5)).toBe(NOW - 5 * MINUTE);
	});

	it("adds to a count-up clock by moving its start earlier", () => {
		expect(steppedStart(NOW, "seeking", 5)).toBe(NOW - 5 * MINUTE);
		expect(steppedStart(NOW, "seeking", -5)).toBe(NOW + 5 * MINUTE);
	});
});

describe("clampStart", () => {
	const round = { hidingStartedAt: NOW - 40 * MINUTE };
	const at = (offset: number) => NOW + offset;

	it("never lets a phase start in the future", () => {
		expect(clampStart(at(MINUTE), "hiding", round, NOW, at(-MINUTE))).toBe(NOW);
		expect(clampStart(at(MINUTE), "seeking", round, NOW, at(-MINUTE))).toBe(
			NOW,
		);
	});

	it("never puts seeking before hiding began", () => {
		expect(
			clampStart(at(-50 * MINUTE), "seeking", round, NOW, at(-10 * MINUTE)),
		).toBe(round.hidingStartedAt);
	});

	it("leaves an instant inside the bounds alone", () => {
		expect(
			clampStart(at(-10 * MINUTE), "seeking", round, NOW, at(-5 * MINUTE)),
		).toBe(at(-10 * MINUTE));
	});

	/**
	 * The bug behind "+5m moved the clock by two hours": a countdown that ran
	 * out long ago sits far below any floor derived from `now`, and folding it
	 * in on the first tap is an edit of that whole distance.
	 */
	it("does not drag a value that already sits outside the bound", () => {
		const current = at(-2 * 60 * MINUTE);
		expect(
			clampStart(current + 5 * MINUTE, "hiding", round, NOW, current),
		).toBe(current + 5 * MINUTE);
		const early = round.hidingStartedAt - 30 * MINUTE;
		expect(clampStart(early + 5 * MINUTE, "seeking", round, NOW, early)).toBe(
			early + 5 * MINUTE,
		);
	});

	/** A spent hiding countdown is a state a round is allowed to be in. */
	it("puts no floor under the hiding phase", () => {
		const current = at(-31 * MINUTE);
		expect(clampStart(at(-90 * MINUTE), "hiding", round, NOW, current)).toBe(
			at(-90 * MINUTE),
		);
	});

	it("has no floor for seeking when hiding never recorded a start", () => {
		const orphan = { hidingStartedAt: null };
		expect(
			clampStart(at(-500 * MINUTE), "seeking", orphan, NOW, at(-MINUTE)),
		).toBe(at(-500 * MINUTE));
	});
});

describe("startProblem", () => {
	const round = { hidingStartedAt: NOW - 40 * MINUTE };

	it("passes an instant that has already happened", () => {
		expect(startProblem(NOW - MINUTE, "hiding", round, NOW)).toBeNull();
		expect(startProblem(NOW, "hiding", round, NOW)).toBeNull();
	});

	it("refuses the future", () => {
		expect(startProblem(NOW + 1, "hiding", round, NOW)).toMatch(
			/still to come/,
		);
	});

	it("refuses seeking that starts before hiding did", () => {
		expect(
			startProblem(round.hidingStartedAt - 1, "seeking", round, NOW),
		).toMatch(/before hiding/);
		expect(
			startProblem(round.hidingStartedAt - 1, "hiding", round, NOW),
		).toBeNull();
	});
});

describe("resolveTimeInput", () => {
	it("reads a time earlier today as today", () => {
		expect(resolveTimeInput("15:42", NOW)).toBe(
			new Date(2026, 8, 1, 15, 42, 0).getTime(),
		);
	});

	it("takes seconds when the field offers them", () => {
		expect(resolveTimeInput("15:42:07", NOW)).toBe(
			new Date(2026, 8, 1, 15, 42, 7).getTime(),
		);
	});

	/**
	 * Nearest, not "most recent": at 16:04 tonight's 23:40 is seven hours off
	 * and last night's is sixteen, so this is tonight — a future instant, which
	 * `startProblem` is what refuses.
	 */
	it("reads a later time today as today, not as yesterday", () => {
		expect(resolveTimeInput("23:40", NOW)).toBe(
			new Date(2026, 8, 1, 23, 40, 0).getTime(),
		);
	});

	/**
	 * A minute nudged past the present is a minute in the future, to be
	 * refused as one — not rewritten to the same time yesterday.
	 */
	it("keeps a time just after the reference on today", () => {
		expect(resolveTimeInput("16:06", NOW)).toBe(
			new Date(2026, 8, 1, 16, 6, 0).getTime(),
		);
	});

	it("reads last night correctly from the small hours", () => {
		const smallHours = new Date(2026, 8, 2, 0, 10, 0).getTime();
		expect(resolveTimeInput("23:40", smallHours)).toBe(
			new Date(2026, 8, 1, 23, 40, 0).getTime(),
		);
	});

	it("keeps a time equal to the reference on the reference's own day", () => {
		expect(resolveTimeInput("16:04:30", NOW)).toBe(NOW);
	});

	it("refuses anything that is not a wall time", () => {
		expect(resolveTimeInput("", NOW)).toBeNull();
		expect(resolveTimeInput("25:00", NOW)).toBeNull();
		expect(resolveTimeInput("12:60", NOW)).toBeNull();
		expect(resolveTimeInput("half past four", NOW)).toBeNull();
	});
});
