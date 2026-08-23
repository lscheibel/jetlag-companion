import { type BBox, distanceMeters, type Meters } from "@zero-lag/geo";
import type { ScalePreset } from "@zero-lag/schema";

/**
 * What a scale preset sets, and what it merely records. m4-spec §6.
 *
 * Both numbers are host-overridable and overriding them does not change the
 * preset: a host who builds a `city` map and then sets a 5 km hiding radius has
 * a `city` map with big zones, and M6 offering them city-scale question
 * distances is the correct reading of what they did.
 */
export interface ScaleSettings {
	/** How far past the area to materialise stops. m4-spec §5. */
	readonly marginMeters: Meters;
	readonly hidingRadiusMeters: Meters;
}

export const SCALE_SETTINGS: Readonly<Record<ScalePreset, ScaleSettings>> = {
	district: { marginMeters: 5_000, hidingRadiusMeters: 300 },
	city: { marginMeters: 10_000, hidingRadiusMeters: 500 },
	metro: { marginMeters: 25_000, hidingRadiusMeters: 1_000 },
	state: { marginMeters: 50_000, hidingRadiusMeters: 2_500 },
	ticket: { marginMeters: 100_000, hidingRadiusMeters: 5_000 },
};

/**
 * The corner-to-corner span of an area's bounding box.
 *
 * A diagonal rather than a width because a Ringbahn game and a game along one
 * S-Bahn line are the same scale to a host and wildly different in one axis.
 */
export function spanMeters(bbox: BBox): Meters {
	return distanceMeters([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
}

/**
 * Suggest a preset from the area's own extent.
 *
 * **Never from an administrative level.** Berlin's Bezirke are `admin_level` 9
 * and Hamburg's too, while elsewhere that level is a Stadtbezirk of a level-8
 * Gemeinde — so a preset chosen from the level would be wrong in the city this
 * is seeded with. The area's size is a fact about the area. m4-spec §4.
 *
 * §6's table quotes *spans*; these thresholds are on the **diagonal**, which is
 * a larger number for the same map. They are calibrated against real draws
 * rather than converted arithmetically:
 *
 * - Berlin's city limits are a 59 km diagonal and must read as `city`. That one
 *   case sets the city/metro line, because a host drawing the boundary of the
 *   city they live in has drawn a city.
 * - Friedrichshain-Kreuzberg is 7.6 km, comfortably a `district`.
 * - Germany is 1,074 km, comfortably a `ticket`.
 *
 * A preset is a default, not a verdict: both numbers it sets are overridable,
 * and being one band out costs a host one tap.
 */
export function suggestScalePreset(bbox: BBox): ScalePreset {
	const km = spanMeters(bbox) / 1000;
	if (km < 20) return "district";
	if (km < 75) return "city";
	if (km < 200) return "metro";
	if (km < 700) return "state";
	return "ticket";
}
