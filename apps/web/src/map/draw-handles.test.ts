import { offsetLngLat } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import {
	type HandleTarget,
	hitHandle,
	hitRingEdge,
	radiusHandles,
	ringHandles,
	ringMidpoints,
} from "./draw-handles";

const identity = (point: readonly [number, number]) => ({
	x: point[0],
	y: point[1],
});

describe("radiusHandles", () => {
	it("is empty until there is a centre", () => {
		expect(radiusHandles(null, 500)).toEqual([]);
	});

	it("puts the edge due east of the centre", () => {
		const center = [13.4, 52.5] as const;
		const handles = radiusHandles(center, 400);
		expect(handles).toHaveLength(2);
		expect(handles[0]?.handle).toEqual({ kind: "radius-center" });
		expect(handles[0]?.point).toEqual(center);
		expect(handles[1]?.handle).toEqual({ kind: "radius-edge" });
		expect(handles[1]?.point).toEqual(offsetLngLat(center, 400, 0));
	});
});

describe("ringHandles", () => {
	it("indexes every vertex", () => {
		const points = [
			[13, 52],
			[13.1, 52],
			[13.1, 52.1],
		] as const;
		expect(ringHandles(points).map((target) => target.handle)).toEqual([
			{ kind: "vertex", index: 0 },
			{ kind: "vertex", index: 1 },
			{ kind: "vertex", index: 2 },
		]);
	});
});

describe("hitHandle", () => {
	const handles: readonly HandleTarget[] = [
		{ handle: { kind: "radius-center" }, point: [0, 0] },
		{ handle: { kind: "radius-edge" }, point: [100, 0] },
	];

	it("returns the nearest handle within slop", () => {
		expect(hitHandle(handles, { x: 8, y: 0 }, identity, 22)).toEqual({
			kind: "radius-center",
		});
		expect(hitHandle(handles, { x: 90, y: 4 }, identity, 22)).toEqual({
			kind: "radius-edge",
		});
	});

	it("misses outside slop", () => {
		expect(hitHandle(handles, { x: 50, y: 0 }, identity, 22)).toBeNull();
	});

	it("keeps the earlier handle on a tie", () => {
		const collapsed: readonly HandleTarget[] = [
			{ handle: { kind: "radius-center" }, point: [0, 0] },
			{ handle: { kind: "radius-edge" }, point: [0, 0] },
		];
		expect(hitHandle(collapsed, { x: 0, y: 0 }, identity, 22)).toEqual({
			kind: "radius-center",
		});
	});
});

describe("ringMidpoints", () => {
	const points = [
		[0, 0],
		[10, 0],
		[10, 10],
	] as const;

	it("is one per open edge", () => {
		expect(ringMidpoints(points, false)).toEqual([
			[5, 0],
			[10, 5],
		]);
	});

	it("adds the closing edge when the ring is closed", () => {
		expect(ringMidpoints(points, true)).toEqual([
			[5, 0],
			[10, 5],
			[5, 5],
		]);
	});
});

describe("hitRingEdge", () => {
	const points = [
		[0, 0],
		[100, 0],
		[100, 100],
	] as const;

	it("inserts on the nearest open edge", () => {
		expect(hitRingEdge(points, { x: 50, y: 4 }, identity, false)).toEqual({
			insertIndex: 1,
			point: [50, 0],
		});
	});

	it("hits the closing edge only when the ring is closed", () => {
		expect(hitRingEdge(points, { x: 48, y: 52 }, identity, false)).toBeNull();
		expect(hitRingEdge(points, { x: 48, y: 52 }, identity, true)).toEqual({
			insertIndex: 3,
			point: [50, 50],
		});
	});

	it("misses beside an edge outside slop", () => {
		expect(hitRingEdge(points, { x: 50, y: 40 }, identity, false)).toBeNull();
	});
});
