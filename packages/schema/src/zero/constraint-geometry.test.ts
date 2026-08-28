import { describe, expect, it } from "vitest";
import { constraintGeometry } from "./constraint-geometry";

describe("constraintGeometry", () => {
	it("lifts a stored single center to centers", () => {
		expect(
			constraintGeometry.parse({
				kind: "radius",
				center: [13.4, 52.5],
				radius: 800,
			}),
		).toEqual({
			kind: "radius",
			centers: [[13.4, 52.5]],
			radius: 800,
		});
	});

	it("keeps an explicit centers array", () => {
		expect(
			constraintGeometry.parse({
				kind: "radius",
				centers: [
					[13.4, 52.5],
					[13.41, 52.51],
				],
				radius: 500,
			}),
		).toEqual({
			kind: "radius",
			centers: [
				[13.4, 52.5],
				[13.41, 52.51],
			],
			radius: 500,
		});
	});

	it("rejects a radius with no point", () => {
		expect(
			constraintGeometry.safeParse({ kind: "radius", radius: 800 }).success,
		).toBe(false);
	});
});
