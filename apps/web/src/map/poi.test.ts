import { describe, expect, it } from "vitest";
import { DEFAULT_POI_LAYERS, togglePoiKind } from "./poi";

describe("togglePoiKind", () => {
	it("adds and removes a kind without touching transit", () => {
		const withMuseum = togglePoiKind(DEFAULT_POI_LAYERS, "museum");
		expect(withMuseum.transit).toBe(true);
		expect(withMuseum.kinds).toEqual(["museum"]);
		expect(togglePoiKind(withMuseum, "museum").kinds).toEqual([]);
	});
});
