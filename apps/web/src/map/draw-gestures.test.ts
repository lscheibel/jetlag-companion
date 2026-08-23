import { describe, expect, it } from "vitest";
import { applyRadiusGesture, applyRingGesture } from "./draw-gestures";

const CENTER = [13.4, 52.5] as const;
const EAST = [13.41, 52.5] as const;
const NORTH = [13.4, 52.51] as const;

describe("applyRadiusGesture", () => {
	const empty = { center: null, radiusMeters: 500 };

	it("places the centre on the first tap", () => {
		expect(applyRadiusGesture(empty, { kind: "tap", point: CENTER })).toEqual({
			center: CENTER,
			radiusMeters: 500,
		});
	});

	it("ignores a second tap once the centre is set", () => {
		const placed = { center: CENTER, radiusMeters: 500 };
		expect(applyRadiusGesture(placed, { kind: "tap", point: EAST })).toEqual(
			placed,
		);
	});

	it("resizes from the edge without moving the centre", () => {
		const placed = { center: CENTER, radiusMeters: 500 };
		const next = applyRadiusGesture(placed, {
			kind: "move",
			handle: { kind: "radius-edge" },
			point: EAST,
		});
		expect(next.center).toEqual(CENTER);
		expect(next.radiusMeters).toBeGreaterThan(1);
		expect(next.radiusMeters).not.toBe(500);
	});

	it("moves the centre without changing the radius", () => {
		const placed = { center: CENTER, radiusMeters: 500 };
		expect(
			applyRadiusGesture(placed, {
				kind: "move",
				handle: { kind: "radius-center" },
				point: NORTH,
			}),
		).toEqual({ center: NORTH, radiusMeters: 500 });
	});

	it("does not treat a vertex move as a radius edit", () => {
		const placed = { center: CENTER, radiusMeters: 500 };
		expect(
			applyRadiusGesture(placed, {
				kind: "move",
				handle: { kind: "vertex", index: 0 },
				point: EAST,
			}),
		).toEqual(placed);
	});

	it("is a no-op on end", () => {
		const placed = { center: CENTER, radiusMeters: 500 };
		expect(applyRadiusGesture(placed, { kind: "end" })).toEqual(placed);
	});
});

describe("applyRingGesture", () => {
	it("appends on tap", () => {
		expect(
			applyRingGesture({ points: [CENTER] }, { kind: "tap", point: EAST }),
		).toEqual({ points: [CENTER, EAST] });
	});

	it("moves only the indexed vertex", () => {
		expect(
			applyRingGesture(
				{ points: [CENTER, EAST, NORTH] },
				{ kind: "move", handle: { kind: "vertex", index: 1 }, point: CENTER },
			),
		).toEqual({ points: [CENTER, CENTER, NORTH] });
	});

	it("ignores a drag that was not a vertex", () => {
		const draft = { points: [CENTER, EAST] };
		expect(
			applyRingGesture(draft, {
				kind: "move",
				handle: { kind: "radius-edge" },
				point: NORTH,
			}),
		).toEqual(draft);
	});

	it("ignores an out-of-range vertex", () => {
		const draft = { points: [CENTER] };
		expect(
			applyRingGesture(draft, {
				kind: "move",
				handle: { kind: "vertex", index: 3 },
				point: NORTH,
			}),
		).toEqual(draft);
	});

	it("inserts a vertex at the given index", () => {
		expect(
			applyRingGesture(
				{ points: [CENTER, EAST] },
				{ kind: "insert", index: 1, point: NORTH },
			),
		).toEqual({ points: [CENTER, NORTH, EAST] });
	});
});
