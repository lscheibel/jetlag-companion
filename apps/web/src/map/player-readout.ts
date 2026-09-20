import { distanceMeters, type LngLat } from "@zero-lag/geo";
import type { Staleness } from "./staleness";

/**
 * Which one fact the card leads with. Deck 13 proposal A.
 *
 * A tap on a marker is a question with a short answer, and the answer is not
 * the same answer at every age. While a position is still current the fact is
 * **how far away they are**; once it has gone cold the fact is **how long ago**
 * — because a distance to a forty-minute-old position is a distance to where
 * somebody used to be, and printing it large is printing a number that will be
 * acted on and is wrong.
 *
 * The same argument m2-spec §7 makes about battery, applied to a headline
 * rather than to a row: the asymmetry is the point. An old position is still a
 * fact about the world and stays on the card; an old *distance* is arithmetic
 * nobody should be invited to do.
 */
export type Readout =
	/** How far away, now. */
	| { readonly kind: "distance"; readonly meters: number }
	/** How long ago — the position is history, and says so. */
	| { readonly kind: "age"; readonly ageMs: number }
	/** Your own card: the one number only your own marker has. */
	| { readonly kind: "accuracy"; readonly accuracyMeters: number | null }
	/** In the game, nowhere on the map. */
	| { readonly kind: "absent" };

export interface ReadoutInput {
	readonly isSelf: boolean;
	readonly staleness: Staleness;
	readonly ageMs: number | null;
	/** Where they are, or null when there has never been a fix. */
	readonly point: LngLat | null;
	readonly accuracyMeters: number | null;
	/** This phone's own fix, or null when it has none to measure from. */
	readonly fromYou: LngLat | null;
}

export function readoutOf({
	isSelf,
	staleness,
	ageMs,
	point,
	accuracyMeters,
	fromYou,
}: ReadoutInput): Readout {
	if (point === null) return { kind: "absent" };

	// Your own distance from yourself is zero, and your own age is a fact about
	// this device's last read rather than about a phone somewhere else. What is
	// left that nobody else's card can say is how well this phone is fixed.
	if (isSelf) return { kind: "accuracy", accuracyMeters };

	if (ageMs === null || staleness === "never") return { kind: "absent" };

	// Past the point where the marker itself stops claiming a position, the
	// headline stops claiming one too.
	if (staleness === "cold") return { kind: "age", ageMs };

	// Nothing to measure from is not a reason to say nothing: the age is a fact
	// this phone holds either way.
	if (fromYou === null) return { kind: "age", ageMs };

	return { kind: "distance", meters: distanceMeters(fromYou, point) };
}

/**
 * The eight points of the compass, in words.
 *
 * Words rather than degrees because the card is read while walking out of a
 * station: "facing north-east" is a direction to turn, and "41°" is a number to
 * convert. Only ever applied to this device's own heading — m2-spec §8 keeps
 * facing off the wire entirely.
 */
const POINTS = [
	"north",
	"north-east",
	"east",
	"south-east",
	"south",
	"south-west",
	"west",
	"north-west",
] as const;

export function compassPoint(headingDeg: number): string {
	const wrapped = ((headingDeg % 360) + 360) % 360;
	const index = Math.round(wrapped / 45) % POINTS.length;
	return POINTS[index] ?? POINTS[0];
}
