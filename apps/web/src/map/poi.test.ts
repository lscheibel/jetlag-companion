import { describe, expect, it } from "vitest";
import {
	boardStopModes,
	closestPoiSites,
	DEFAULT_POI_LAYERS,
	ensurePoiKind,
	ensurePoiType,
	type MapPoi,
	poiModeOn,
	radiusPoiCenters,
	stationPois,
	stopIdOfPoi,
	stopsForModes,
	togglePoiKind,
	togglePoiMode,
} from "./poi";
import type { SearchableStop } from "./toolkit";

describe("togglePoiKind", () => {
	it("adds and removes a kind without touching the stations", () => {
		const withMuseum = togglePoiKind(DEFAULT_POI_LAYERS, "museum");
		expect(withMuseum.modes).toBeNull();
		expect(withMuseum.kinds).toEqual(["museum"]);
		expect(togglePoiKind(withMuseum, "museum").kinds).toEqual([]);
	});
});

function stop(stopId: string, modeIds: readonly string[]): SearchableStop {
	return {
		stopId,
		name: stopId,
		lng: 13.4,
		lat: 52.5,
		modeIds,
		lines: [],
		insideArea: true,
	};
}

const ALEX = stop("alex", ["u-bahn", "s-bahn", "tram"]);
const BUS_ONLY = stop("bus-stop", ["bus"]);
const FERRY = stop("ferry-pier", ["ferry"]);

describe("boardStopModes", () => {
	it("lists the modes the board carries, in signage order", () => {
		expect(boardStopModes([BUS_ONLY, ALEX])).toEqual([
			"u-bahn",
			"s-bahn",
			"tram",
			"bus",
		]);
	});

	it("is empty for a board with no stops", () => {
		expect(boardStopModes([])).toEqual([]);
	});
});

describe("togglePoiMode", () => {
	const available = ["u-bahn", "s-bahn", "bus"] as const;

	it("turning one off is what turns the filter on", () => {
		const withoutBus = togglePoiMode(DEFAULT_POI_LAYERS, "bus", available);
		expect(withoutBus.modes).toEqual(["u-bahn", "s-bahn"]);
		expect(poiModeOn(withoutBus, "bus")).toBe(false);
		expect(poiModeOn(withoutBus, "u-bahn")).toBe(true);
	});

	it("turning the last one back on returns to everything", () => {
		const withoutBus = togglePoiMode(DEFAULT_POI_LAYERS, "bus", available);
		expect(togglePoiMode(withoutBus, "bus", available).modes).toBeNull();
	});

	it("can leave nothing plotted", () => {
		const modes = available.reduce<typeof DEFAULT_POI_LAYERS>(
			(state, modeId) => togglePoiMode(state, modeId, available),
			DEFAULT_POI_LAYERS,
		);
		expect(modes.modes).toEqual([]);
	});
});

describe("stopsForModes", () => {
	it("keeps every stop when no filter is on", () => {
		expect(stopsForModes([ALEX, BUS_ONLY, FERRY], null)).toHaveLength(3);
	});

	it("keeps a stop served by any chosen mode", () => {
		expect(
			stopsForModes([ALEX, BUS_ONLY, FERRY], ["u-bahn"]).map(
				(row) => row.stopId,
			),
		).toEqual([ALEX.stopId]);
	});

	it("plots nothing when every mode is off", () => {
		expect(stopsForModes([ALEX, BUS_ONLY], [])).toEqual([]);
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

describe("radiusPoiCenters", () => {
	it("keeps same-kind in-area pins and drops those outside the fence", () => {
		expect(radiusPoiCenters("zoo", [ZOO, TIERPARK, OUTSIDE_ZOO, PARK])).toEqual(
			[
				[ZOO.lng, ZOO.lat],
				[TIERPARK.lng, TIERPARK.lat],
			],
		);
	});

	it("is empty when the kind is absent", () => {
		expect(radiusPoiCenters("museum", [ZOO, PARK])).toEqual([]);
	});
});

describe("stationPois", () => {
	it("gives a hub one pin per station type it serves", () => {
		const pins = stationPois([ALEX]);
		expect(pins.map((pin) => pin.kind)).toEqual(["u-bahn", "s-bahn", "tram"]);
		expect(new Set(pins.map((pin) => pin.id)).size).toBe(3);
		for (const pin of pins) expect(pin.name).toBe(ALEX.name);
	});

	it("points every pin back at its station", () => {
		for (const pin of stationPois([ALEX, BUS_ONLY])) {
			expect(stopIdOfPoi(pin)).toBe(
				pin.name === ALEX.name ? ALEX.stopId : BUS_ONLY.stopId,
			);
		}
	});

	it("leaves amenity pins alone", () => {
		expect(stopIdOfPoi(ZOO)).toBeNull();
	});
});

describe("closestPoiSites over station pins", () => {
	it("keeps only the same station type", () => {
		const pins = stationPois([ALEX, BUS_ONLY]);
		const uBahn = pins.find((pin) => pin.kind === "u-bahn");
		if (!uBahn) throw new Error("no U-Bahn pin");
		const { others } = closestPoiSites(uBahn, [...pins, ZOO]);
		expect(others).toEqual([]);
	});
});

describe("ensurePoiType", () => {
	it("switches an amenity kind on", () => {
		expect(ensurePoiType(DEFAULT_POI_LAYERS, "zoo").kinds).toEqual(["zoo"]);
	});

	it("switches a station type back on without disturbing the others", () => {
		const available = ["u-bahn", "s-bahn", "bus"] as const;
		const withoutBus = togglePoiMode(DEFAULT_POI_LAYERS, "bus", available);
		const back = ensurePoiType(withoutBus, "bus");
		expect(poiModeOn(back, "bus")).toBe(true);
		expect(poiModeOn(back, "u-bahn")).toBe(true);
	});

	it("leaves a layer that already plots everything alone", () => {
		expect(ensurePoiType(DEFAULT_POI_LAYERS, "bus")).toBe(DEFAULT_POI_LAYERS);
	});
});

describe("radiusPoiCenters over station pins", () => {
	it("takes every station of one type inside the area", () => {
		const pins = stationPois([ALEX, BUS_ONLY]);
		expect(radiusPoiCenters("bus", pins)).toEqual([
			[BUS_ONLY.lng, BUS_ONLY.lat],
		]);
	});
});
