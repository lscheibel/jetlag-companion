import { describe, expect, it } from "vitest";
import { TRACKER_APPS, trackerAppsFor } from "./api";

/**
 * Which apps a phone is offered. m15-spec §6.
 *
 * Getting this wrong is not cosmetic: OsmAnd's online tracking setting does not
 * exist on iOS and GPSLogger has no iOS build, so offering either to an iPhone
 * sends a player to install an app, find a settings screen that is not there,
 * and conclude the feature is broken.
 */
describe("the tracker apps offered to a phone", () => {
	it("gives an iPhone only apps that can actually do it", () => {
		const ids = trackerAppsFor("ios").map((app) => app.id);

		expect(ids).toContain("owntracks");
		expect(ids).toContain("overland");
		expect(ids).toContain("traccar");
		// Online tracking is an Android-only setting, whatever the store says.
		expect(ids).not.toContain("osmand");
		expect(ids).not.toContain("gpslogger");
	});

	it("gives Android the three named apps, then the protocol catch-all", () => {
		const ids = trackerAppsFor("android").map((app) => app.id);

		expect(ids).toEqual(["owntracks", "osmand", "gpslogger", "traccar"]);
	});

	it("shows everything when it cannot tell, rather than nothing", () => {
		// A desktop browser cannot say which phone is in the player's hand, and an
		// empty screen is a worse answer than a list with two spare entries.
		expect(trackerAppsFor("unknown")).toEqual(TRACKER_APPS);
	});

	it("leads with OwnTracks on both phones", () => {
		expect(trackerAppsFor("ios")[0]?.id).toBe("owntracks");
		expect(trackerAppsFor("android")[0]?.id).toBe("owntracks");
	});

	it("gives every named app somewhere to be installed from", () => {
		for (const app of TRACKER_APPS) {
			if (app.id === "traccar") {
				// A protocol, not a store listing — the player already has the app.
				expect(app.install).toBeNull();
				continue;
			}
			expect(app.install).toMatch(/^https:\/\//);
			expect(app.installLabel?.length).toBeGreaterThan(0);
		}
	});

	it("gives every app a glyph, so a door never opens with an empty tile", () => {
		for (const app of TRACKER_APPS) {
			expect(app.glyph.length).toBeGreaterThan(0);
		}
	});

	it("gives the placeholder apps a query and the JSON apps none", () => {
		const query = (id: string) =>
			TRACKER_APPS.find((app) => app.id === id)?.query;

		// Positional for OsmAnd, named for GPSLogger — not interchangeable, and
		// handing either one the other's string fails silently.
		expect(query("osmand")).toContain("lat={0}");
		expect(query("gpslogger")).toContain("lat=%LAT");
		// These two POST JSON, so a query string would be noise they ignore.
		expect(query("owntracks")).toBeNull();
		expect(query("overland")).toBeNull();
		// Traccar-family clients append lat/lon themselves.
		expect(query("traccar")).toBeNull();
	});
});
