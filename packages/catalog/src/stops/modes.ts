/**
 * What mode a GTFS route counts as. m4-spec §4.
 *
 * **This is a heuristic and is labelled one.** The gtfs.de `de_full` feed uses
 * the *basic* GTFS route types, not the extended ones, so every S-Bahn, every
 * RE and every ICE arrives as `route_type = 2` — and S-Bahn versus regional
 * rail is precisely the distinction a German game is built on. It is recovered
 * from `route_short_name`, which is clean.
 *
 * `modes.test.ts` asserts the counts below against the real feed when it is
 * present, so the day a feed changes shape the test says so instead of the
 * U-Bahn quietly becoming a train.
 */

export const MODE_IDS = [
	"tram",
	"u-bahn",
	"s-bahn",
	"regional",
	"long-distance",
	"bus",
	"ferry",
	"funicular",
] as const;

export type ModeId = (typeof MODE_IDS)[number];

/** Basic GTFS `route_type`. 2 is absent: rail is decided by short name. */
const BY_ROUTE_TYPE: Readonly<Record<number, ModeId>> = {
	0: "tram",
	1: "u-bahn",
	3: "bus",
	4: "ferry",
	7: "funicular",
};

const RAIL_BY_PREFIX: Readonly<Record<string, ModeId>> = {
	S: "s-bahn",

	RB: "regional",
	RE: "regional",
	RS: "regional",
	MEX: "regional",

	ICE: "long-distance",
	IC: "long-distance",
	EC: "long-distance",
	ECE: "long-distance",
	RJ: "long-distance",
	NJ: "long-distance",
	EN: "long-distance",
	CD: "long-distance",
};

/** Leading letters of a line name: `RE 3` → `RE`, `S1` → `S`, `ICE 599` → `ICE`. */
export function routePrefix(shortName: string): string {
	const match = /^\s*([A-Za-zÄÖÜäöüß]+)/.exec(shortName);
	return match ? (match[1] as string).toUpperCase() : "";
}

/**
 * Rail that matches no prefix falls back to `regional` — 128 routes in the
 * current feed, most of them small private operators (`DRF`, `DWE`, `MBB`) plus
 * 43 with no short name at all. A local train run by a company nobody outside
 * the Landkreis has heard of is a regional train, and calling it long-distance
 * or S-Bahn would both be worse guesses.
 */
export function classifyRoute(
	routeType: number,
	shortName: string,
): ModeId | null {
	const basic = BY_ROUTE_TYPE[routeType];
	if (basic) return basic;
	if (routeType !== 2) return null;
	return RAIL_BY_PREFIX[routePrefix(shortName)] ?? "regional";
}
