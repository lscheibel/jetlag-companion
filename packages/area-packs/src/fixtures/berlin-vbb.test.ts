import {
	multiPolygonToRegion,
	regionArea,
	regionContains,
	regionHash,
} from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { validateAreaPack, validateMapConfig } from "../validate";
import { BERLIN_VBB_PACK, berlinFixtureMapConfig } from "./berlin-vbb";

describe("the Berlin fixture", () => {
	it("is a valid pack", () => {
		expect(validateAreaPack(BERLIN_VBB_PACK)).toEqual({ ok: true });
	});

	it("produces a valid map config", () => {
		const config = berlinFixtureMapConfig("game-1");
		expect(validateMapConfig(config, BERLIN_VBB_PACK)).toEqual({ ok: true });
	});

	it("builds the same area every time", () => {
		const a = berlinFixtureMapConfig("game-1");
		const b = berlinFixtureMapConfig("game-2");
		expect(b.contentHash).toBe(a.contentHash);
		expect(regionHash(multiPolygonToRegion(b.validHidingArea))).toBe(
			regionHash(multiPolygonToRegion(a.validHidingArea)),
		);
	});

	it("covers the stations and not the space between distant ones", () => {
		const config = berlinFixtureMapConfig("game-1");
		const area = multiPolygonToRegion(config.validHidingArea);

		const alex = BERLIN_VBB_PACK.stops.find((s) => s.id === "alexanderplatz");
		if (!alex) throw new Error("expected Alexanderplatz in the fixture");
		expect(regionContains(area, alex.position)).toBe(true);

		// Grunewald, well outside every station's disc.
		expect(regionContains(area, [13.22, 52.48])).toBe(false);
	});

	it("is smaller than the sum of its discs, because they overlap", () => {
		const config = berlinFixtureMapConfig("game-1");
		const area = regionArea(multiPolygonToRegion(config.validHidingArea));
		const upperBound = BERLIN_VBB_PACK.stops.length * Math.PI * 1000 * 1000;
		expect(area).toBeGreaterThan(0);
		expect(area).toBeLessThan(upperBound);
	});
});

describe("content hashes", () => {
	it("move when the contents move", () => {
		const config = berlinFixtureMapConfig("game-1");
		const fewerStops = berlinFixtureMapConfig("game-1");
		const mutated = {
			...fewerStops,
			enabledStopIds: fewerStops.enabledStopIds.slice(1),
		};
		expect(validateMapConfig(mutated, BERLIN_VBB_PACK).ok).toBe(false);
		expect(config.contentHash).toBe(fewerStops.contentHash);
	});
});
