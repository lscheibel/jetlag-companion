import { describe, expect, it } from "vitest";
import {
	positionSourceOf,
	trackerAgeLabel,
	trackerIsReporting,
} from "./position-source";
import { AGEING_MS } from "./staleness";

/**
 * The four states, and the one that matters most is `tracker`. m15-spec §6.
 *
 * A player whose browser has no fix but whose tracker is running is *visible to
 * everyone else* while their own map sits there unable to centre. Reporting
 * that as "no position" would send them off to fix a thing that is not broken.
 */
describe("where a position is coming from", () => {
	it("is both when the browser has a fix and the tracker is reporting", () => {
		expect(positionSourceOf({ hasBrowserFix: true, trackerAgeMs: 4_000 })).toBe(
			"both",
		);
	});

	it("is browser when nothing has ever pinged the webhook", () => {
		expect(positionSourceOf({ hasBrowserFix: true, trackerAgeMs: null })).toBe(
			"browser",
		);
	});

	it("is tracker when the page cannot read a location but the phone reports", () => {
		expect(
			positionSourceOf({ hasBrowserFix: false, trackerAgeMs: 30_000 }),
		).toBe("tracker");
	});

	it("is none when neither is reporting", () => {
		expect(positionSourceOf({ hasBrowserFix: false, trackerAgeMs: null })).toBe(
			"none",
		);
	});

	it("stops counting a tracker once its last ping goes cold", () => {
		expect(trackerIsReporting(AGEING_MS - 1)).toBe(true);
		expect(trackerIsReporting(AGEING_MS)).toBe(false);

		// A configured-but-silent tracker is not a source, however recently it
		// was set up — the map would already be drawing that position as cold.
		expect(
			positionSourceOf({ hasBrowserFix: false, trackerAgeMs: AGEING_MS + 1 }),
		).toBe("none");
	});

	it("never reports a tracker that has never been heard from", () => {
		expect(trackerIsReporting(null)).toBe(false);
	});
});

/**
 * The words every screen that says an age uses. m15-spec §6.
 *
 * Seconds under a minute, because the moment this matters most is the one just
 * after a player finished setup in another app and came back to find out
 * whether it took — and the map's own "<1 min ago" is not an answer to that.
 */
describe("how long ago the last ping was", () => {
	it("counts in seconds for the first minute", () => {
		expect(trackerAgeLabel(3_000)).toBe("3 s ago");
		expect(trackerAgeLabel(0)).toBe("0 s ago");
	});

	it("hands anything older to the map's own wording", () => {
		expect(trackerAgeLabel(60_000)).toBe("1 min ago");
		expect(trackerAgeLabel(14 * 60_000)).toBe("14 min ago");
	});
});
