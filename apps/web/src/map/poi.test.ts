import { describe, expect, it } from "vitest";
import {
	closestPoiSites,
	DEFAULT_POI_LAYERS,
	defaultClosestPoiRadius,
	ensurePoiKind,
	type MapPoi,
	radiusPoiCenters,
	togglePoiKind,
} from "./poi";

describe("togglePoiKind", () => {
	it("adds and removes a kind without touching transit", () => {
		const withMuseum = togglePoiKind(DEFAULT_POI_LAYERS, "museum");
		expect(withMuseum.transit).toBe(true);
		expect(withMuseum.kinds).toEqual(["museum"]);
		expect(togglePoiKind(withMuseum, "museum").kinds).toEqual([]);
	});
});

describe("ensurePoiKind", () => {
	it("turns a kind on and leaves it on", () => {
		const once = ensurePoiKind(DEFAULT_POI_LAYERS, "zoo");
		expect(once.kinds).toEqual(["zoo"]);
		expect(ensurePoiKind(once, "zoo").kinds).toEqual(["zoo"]);
	});
});

const ZOO: MapPoi = {
	id: "way/1010",
	name: "Zoo Berlin",
	kind: "zoo",
	lng: 13.337,
	lat: 52.508,
	insideArea: true,
};

const TIERPARK: MapPoi = {
	id: "way/1017",
	name: "Tierpark Berlin",
	kind: "zoo",
	lng: 13.49,
	lat: 52.505,
	insideArea: true,
};

const OUTSIDE_ZOO: MapPoi = {
	id: "way/1099",
	name: "Outside zoo",
	kind: "zoo",
	lng: 13.2,
	lat: 52.5,
	insideArea: false,
};

const PARK: MapPoi = {
	id: "way/1013",
	name: "Großer Tiergarten",
	kind: "park",
	lng: 13.359,
	lat: 52.514,
	insideArea: true,
};

describe("closestPoiSites", () => {
	it("keeps same-kind in-area neighbours and drops the rest", () => {
		const { others } = closestPoiSites(ZOO, [ZOO, TIERPARK, OUTSIDE_ZOO, PARK]);
		expect(others.map((poi) => poi.id)).toEqual([TIERPARK.id]);
	});

	it("still uses an outside selected pin as the generator", () => {
		const { selected, others } = closestPoiSites(OUTSIDE_ZOO, [
			OUTSIDE_ZOO,
			ZOO,
			TIERPARK,
		]);
		expect(selected.id).toBe(OUTSIDE_ZOO.id);
		expect(others.map((poi) => poi.id)).toEqual([ZOO.id, TIERPARK.id]);
	});
});

describe("defaultClosestPoiRadius", () => {
	it("is null without a GPS fix", () => {
		expect(defaultClosestPoiRadius(null, ZOO.lng, ZOO.lat)).toBeNull();
	});

	it("is the geodesic distance from the fix", () => {
		expect(
			defaultClosestPoiRadius([ZOO.lng, ZOO.lat], ZOO.lng, ZOO.lat),
		).toBeNull();
		expect(
			defaultClosestPoiRadius([ZOO.lng, ZOO.lat], TIERPARK.lng, TIERPARK.lat),
		).toBeGreaterThan(0);
	});
});

describe("radiusPoiCenters", () => {
	it("takes every same-kind pin, including those outside the area", () => {
		expect(radiusPoiCenters("zoo", [ZOO, TIERPARK, OUTSIDE_ZOO, PARK])).toEqual(
			[
				[ZOO.lng, ZOO.lat],
				[TIERPARK.lng, TIERPARK.lat],
				[OUTSIDE_ZOO.lng, OUTSIDE_ZOO.lat],
			],
		);
	});

	it("is empty when the kind is absent", () => {
		expect(radiusPoiCenters("museum", [ZOO, PARK])).toEqual([]);
	});
});
