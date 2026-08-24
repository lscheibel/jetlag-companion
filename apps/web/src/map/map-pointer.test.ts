import { offsetLngLat } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import type { RadiusDraft, RingDraft } from "./draw-gestures";
import {
	bindMapPointers,
	type MapPointerEvent,
	type PointerMap,
	type PointerMode,
} from "./map-pointer";

const CENTER = [13.4, 52.5] as const;

function createFakeMap(): PointerMap & {
	panEnabled: boolean;
	emit: (type: string, event: MapPointerEvent) => void;
} {
	const listeners = new Map<string, Set<(event: MapPointerEvent) => void>>();
	const fake: PointerMap & {
		panEnabled: boolean;
		emit: (type: string, event: MapPointerEvent) => void;
	} = {
		panEnabled: true,
		on(type, handler) {
			const set = listeners.get(type) ?? new Set();
			set.add(handler);
			listeners.set(type, set);
		},
		off(type, handler) {
			listeners.get(type)?.delete(handler);
		},
		emit(type, event) {
			for (const handler of listeners.get(type) ?? []) handler(event);
		},
		project(lngLat) {
			const lng = "lng" in lngLat ? lngLat.lng : lngLat[0];
			const lat = "lat" in lngLat ? lngLat.lat : lngLat[1];
			return { x: (lng - 13.4) * 10_000, y: (52.5 - lat) * 10_000 };
		},
		dragPan: {
			disable() {
				fake.panEnabled = false;
			},
			enable() {
				fake.panEnabled = true;
			},
		},
	};
	return fake;
}

function eventAt(
	lng: number,
	lat: number,
	map: PointerMap,
	extra?: { points?: readonly { x: number; y: number }[] },
): MapPointerEvent {
	const point = map.project([lng, lat]);
	return {
		lngLat: { lng, lat },
		point,
		points: extra?.points,
		preventDefault() {},
	};
}

describe("bindMapPointers", () => {
	it("places a centre on tap without holding pan", () => {
		const map = createFakeMap();
		let mode: PointerMode = {
			kind: "radius",
			center: null,
			radiusMeters: 500,
		};
		const radii: RadiusDraft[] = [];
		bindMapPointers(map, {
			getMode: () => mode,
			onTap() {},
			onRadiusChange(draft) {
				radii.push(draft);
				mode = { kind: "radius", ...draft };
			},
			onRingChange() {},
		});

		map.emit("touchstart", eventAt(CENTER[0], CENTER[1], map));
		expect(map.panEnabled).toBe(true);
		map.emit("touchend", eventAt(CENTER[0], CENTER[1], map));

		expect(radii[0]?.center).toEqual([...CENTER]);
		expect(map.panEnabled).toBe(true);
	});

	it("drags the radius edge after a centre is placed", () => {
		const map = createFakeMap();
		let mode: PointerMode = {
			kind: "radius",
			center: CENTER,
			radiusMeters: 500,
		};
		const radii: RadiusDraft[] = [];
		bindMapPointers(map, {
			getMode: () => mode,
			onTap() {},
			onRadiusChange(draft) {
				radii.push(draft);
				mode = { kind: "radius", ...draft };
			},
			onRingChange() {},
		});

		const edge = offsetLngLat(CENTER, 500, 0);
		const farther = offsetLngLat(CENTER, 900, 0);
		map.emit("touchstart", eventAt(edge[0], edge[1], map));
		expect(map.panEnabled).toBe(false);
		map.emit("touchmove", eventAt(farther[0], farther[1], map));
		map.emit("touchend", eventAt(farther[0], farther[1], map));

		expect(radii.length).toBeGreaterThan(0);
		const last = radii[radii.length - 1];
		expect(last?.center).toEqual([...CENTER]);
		expect(last?.radiusMeters).toBeGreaterThan(700);
		expect(map.panEnabled).toBe(true);
	});

	it("leaves pan alone when dragging empty map after a centre is set", () => {
		const map = createFakeMap();
		const mode: PointerMode = {
			kind: "radius",
			center: CENTER,
			radiusMeters: 500,
		};
		const radii: RadiusDraft[] = [];
		bindMapPointers(map, {
			getMode: () => mode,
			onTap() {},
			onRadiusChange(draft) {
				radii.push(draft);
			},
			onRingChange() {},
		});

		map.emit("touchstart", eventAt(13.41, 52.51, map));
		expect(map.panEnabled).toBe(true);
		map.emit("touchmove", eventAt(13.42, 52.52, map));
		map.emit("touchend", eventAt(13.42, 52.52, map));
		expect(radii).toEqual([]);
		expect(map.panEnabled).toBe(true);
	});

	it("taps a ring vertex into the draft and moves it on drag", () => {
		const map = createFakeMap();
		let mode: PointerMode = { kind: "ring", closed: false, points: [] };
		const rings: RingDraft[] = [];
		bindMapPointers(map, {
			getMode: () => mode,
			onTap() {},
			onRadiusChange() {},
			onRingChange(draft) {
				rings.push(draft);
				mode = { kind: "ring", closed: false, points: draft.points };
			},
		});

		map.emit("touchstart", eventAt(CENTER[0], CENTER[1], map));
		map.emit("touchend", eventAt(CENTER[0], CENTER[1], map));
		expect(rings[0]?.points).toEqual([[...CENTER]]);

		const moved = offsetLngLat(CENTER, 200, 0);
		map.emit("touchstart", eventAt(CENTER[0], CENTER[1], map));
		expect(map.panEnabled).toBe(false);
		map.emit("touchmove", eventAt(moved[0], moved[1], map));
		map.emit("touchend", eventAt(moved[0], moved[1], map));
		const last = rings[rings.length - 1];
		expect(last?.points).toHaveLength(1);
		expect(last?.points[0]).not.toEqual([...CENTER]);
	});

	it("inserts a vertex when a ring edge is tapped", () => {
		const map = createFakeMap();
		const start = CENTER;
		const end = offsetLngLat(CENTER, 400, 0);
		let mode: PointerMode = {
			kind: "ring",
			closed: false,
			points: [start, end],
		};
		const rings: RingDraft[] = [];
		bindMapPointers(map, {
			getMode: () => mode,
			onTap() {},
			onRadiusChange() {},
			onRingChange(draft) {
				rings.push(draft);
				mode = { kind: "ring", closed: false, points: draft.points };
			},
		});

		const midLng = (start[0] + end[0]) / 2;
		const midLat = (start[1] + end[1]) / 2;
		map.emit("touchstart", eventAt(midLng, midLat, map));
		map.emit("touchend", eventAt(midLng, midLat, map));

		expect(rings[0]?.points).toHaveLength(3);
		expect(rings[0]?.points[0]).toEqual([...start]);
		expect(rings[0]?.points[2]).toEqual([...end]);
	});

	it("ignores a two-finger touch so pinch-zoom stays MapLibre's", () => {
		const map = createFakeMap();
		const taps: unknown[] = [];
		bindMapPointers(map, {
			getMode: () => ({ kind: "tap" }),
			onTap(point) {
				taps.push(point);
			},
			onRadiusChange() {},
			onRingChange() {},
		});
		map.emit(
			"touchstart",
			eventAt(CENTER[0], CENTER[1], map, {
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 10 },
				],
			}),
		);
		map.emit("touchend", eventAt(CENTER[0], CENTER[1], map));
		expect(taps).toEqual([]);
	});
});
