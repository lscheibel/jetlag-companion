import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { classifyRoute, type ModeId, routePrefix } from "./modes";

describe("classifyRoute", () => {
	it("reads the basic route types", () => {
		expect(classifyRoute(0, "M10")).toBe("tram");
		expect(classifyRoute(1, "U8")).toBe("u-bahn");
		expect(classifyRoute(3, "142")).toBe("bus");
		expect(classifyRoute(4, "F10")).toBe("ferry");
		expect(classifyRoute(7, "")).toBe("funicular");
	});

	it("splits rail by line name, which route_type does not", () => {
		expect(classifyRoute(2, "S1")).toBe("s-bahn");
		expect(classifyRoute(2, "S 41")).toBe("s-bahn");
		expect(classifyRoute(2, "RE 3")).toBe("regional");
		expect(classifyRoute(2, "RB14")).toBe("regional");
		expect(classifyRoute(2, "MEX 16")).toBe("regional");
		expect(classifyRoute(2, "ICE 599")).toBe("long-distance");
		expect(classifyRoute(2, "EC 179")).toBe("long-distance");
	});

	it("calls unrecognised rail regional rather than guessing bigger", () => {
		expect(classifyRoute(2, "DRF 1")).toBe("regional");
		expect(classifyRoute(2, "")).toBe("regional");
	});

	it("has no opinion about route types the feed does not use", () => {
		expect(classifyRoute(5, "")).toBeNull();
		expect(classifyRoute(6, "")).toBeNull();
	});
});

describe("routePrefix", () => {
	it("takes the leading letters and nothing else", () => {
		expect(routePrefix("S1")).toBe("S");
		expect(routePrefix(" RE 3")).toBe("RE");
		expect(routePrefix("142")).toBe("");
		expect(routePrefix("Süd 1")).toBe("SÜD");
	});
});

/**
 * The guard the heuristic exists for. Skipped when the feed is absent — CI has
 * no 2 GB download — but run by anyone who has it, which is anyone about to
 * rebuild the catalog. m4-spec §4.
 */
// Resolved rather than fixed: vitest runs from the repo root and from this
// package depending on who invoked it.
const FEED = ["assets/gtfs/routes.txt", "../../assets/gtfs/routes.txt"].find(
	(path) => existsSync(path),
);

describe.skipIf(!FEED)("against the real feed", () => {
	// `describe.skipIf` still evaluates the factory to collect the tests, so the
	// read has to be guarded here rather than only by the condition above.
	const routes = FEED
		? parseCsv(readFileSync(FEED, "utf8")).map((row) => ({
				type: Number(row.route_type),
				shortName: row.route_short_name ?? "",
			}))
		: [];

	const counts = new Map<ModeId | "unclassified", number>();
	for (const route of routes) {
		const mode = classifyRoute(route.type, route.shortName) ?? "unclassified";
		counts.set(mode, (counts.get(mode) ?? 0) + 1);
	}

	it("classifies every route", () => {
		expect(counts.get("unclassified")).toBeUndefined();
		expect(routes).toHaveLength(24_828);
	});

	it("finds the S-Bahn the route type hides", () => {
		expect(counts.get("s-bahn")).toBe(146);
	});

	it("finds regional rail, long-distance and the U-Bahn", () => {
		// 661 by prefix plus the 128 unrecognised the fallback absorbs.
		expect(counts.get("regional")).toBe(789);
		expect(counts.get("long-distance")).toBe(123);
		expect(counts.get("u-bahn")).toBe(80);
	});

	it("still sees a country that is mostly buses", () => {
		expect(counts.get("bus")).toBe(23_215);
		expect(counts.get("tram")).toBe(385);
	});
});
