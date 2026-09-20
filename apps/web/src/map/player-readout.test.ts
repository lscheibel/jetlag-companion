import { describe, expect, it } from "vitest";
import { compassPoint, type ReadoutInput, readoutOf } from "./player-readout";

/** Ostkreuz and Alexanderplatz, roughly 4 km apart. */
const THEM: ReadoutInput["point"] = [13.4699, 52.5031];
const YOU: ReadoutInput["fromYou"] = [13.4132, 52.5219];

function input(over: Partial<ReadoutInput> = {}): ReadoutInput {
	return {
		isSelf: false,
		staleness: "fresh",
		ageMs: 5_000,
		point: THEM,
		accuracyMeters: 22,
		fromYou: YOU,
		...over,
	};
}

/**
 * The one decision deck 13 A rests on: which fact is still true, and therefore
 * which one is allowed to be the big number.
 */
describe("readoutOf", () => {
	it("leads with the distance while the position is current", () => {
		for (const staleness of ["fresh", "recent", "ageing"] as const) {
			const readout = readoutOf(input({ staleness }));
			expect(readout.kind).toBe("distance");
		}
	});

	it("measures the distance from this phone to theirs", () => {
		const readout = readoutOf(input());
		if (readout.kind !== "distance") throw new Error("expected a distance");
		// Ostkreuz to Alexanderplatz: a few kilometres, not a few metres.
		expect(readout.meters).toBeGreaterThan(3_000);
		expect(readout.meters).toBeLessThan(6_000);
	});

	it("drops to the age once the position is cold", () => {
		expect(readoutOf(input({ staleness: "cold", ageMs: 2_580_000 }))).toEqual({
			kind: "age",
			ageMs: 2_580_000,
		});
	});

	it("falls back to the age with no fix of your own to measure from", () => {
		expect(readoutOf(input({ fromYou: null }))).toEqual({
			kind: "age",
			ageMs: 5_000,
		});
	});

	it("says nothing about a player who has never reported", () => {
		expect(readoutOf(input({ point: null, ageMs: null })).kind).toBe("absent");
		expect(readoutOf(input({ staleness: "never", ageMs: null })).kind).toBe(
			"absent",
		);
	});

	/**
	 * Your own card never shows a distance — it would be zero — and never an
	 * age, because the fix came off this device's own watch a moment ago rather
	 * than round-tripping through presence. m2-spec §4.
	 */
	it("leads with accuracy on your own card, at every age", () => {
		for (const staleness of ["fresh", "ageing", "cold"] as const) {
			expect(readoutOf(input({ isSelf: true, staleness }))).toEqual({
				kind: "accuracy",
				accuracyMeters: 22,
			});
		}
	});

	it("keeps your own card when the accuracy is unknown", () => {
		expect(readoutOf(input({ isSelf: true, accuracyMeters: null }))).toEqual({
			kind: "accuracy",
			accuracyMeters: null,
		});
	});

	it("has nothing to lead with when this phone has no fix either", () => {
		expect(readoutOf(input({ isSelf: true, point: null })).kind).toBe("absent");
	});
});

describe("compassPoint", () => {
	it("names the eight points", () => {
		expect(compassPoint(0)).toBe("north");
		expect(compassPoint(45)).toBe("north-east");
		expect(compassPoint(90)).toBe("east");
		expect(compassPoint(135)).toBe("south-east");
		expect(compassPoint(180)).toBe("south");
		expect(compassPoint(225)).toBe("south-west");
		expect(compassPoint(270)).toBe("west");
		expect(compassPoint(315)).toBe("north-west");
	});

	it("rounds to the nearest point and wraps past north", () => {
		expect(compassPoint(22)).toBe("north");
		expect(compassPoint(23)).toBe("north-east");
		expect(compassPoint(350)).toBe("north");
		expect(compassPoint(360)).toBe("north");
		expect(compassPoint(-45)).toBe("north-west");
		expect(compassPoint(810)).toBe("east");
	});
});
