import {
	regionArea,
	regionContains,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import type { AreaPiece } from "@zero-lag/schema";
import { describe, expect, it } from "vitest";
import { BERLIN_FIXTURE_CATALOG } from "../stops/fixture";
import { buildMap, drawnSelection } from "./build";
import {
	composedSelection,
	foldPieces,
	nameFromPieces,
	piecesFromSelection,
} from "./pieces";

/** A 0.1° × 0.05° box over central Berlin. */
const OUTER: AreaPiece["geometry"] = [
	[
		[
			[13.34, 52.5],
			[13.44, 52.5],
			[13.44, 52.55],
			[13.34, 52.55],
			[13.34, 52.5],
		],
	],
];

/** Nested inside OUTER, the south-west quarter. */
const INNER: AreaPiece["geometry"] = [
	[
		[
			[13.34, 52.5],
			[13.39, 52.5],
			[13.39, 52.525],
			[13.34, 52.525],
			[13.34, 52.5],
		],
	],
];

function piece(
	id: string,
	op: AreaPiece["op"],
	geometry: AreaPiece["geometry"],
	name = id,
): AreaPiece {
	return { id, op, source: "drawn", name, geometry };
}

describe("foldPieces", () => {
	it("unions two additions", () => {
		const folded = foldPieces([
			piece("a", "add", OUTER),
			piece("b", "add", INNER),
		]);
		expect(regionContains(folded, [13.39, 52.52])).toBe(true);
		expect(regionContains(folded, [13.365, 52.512])).toBe(true);
		expect(regionArea(folded)).toBeCloseTo(
			regionArea(foldPieces([piece("a", "add", OUTER)])),
			-2,
		);
	});

	it("subtracts a cut from what is already there", () => {
		const full = foldPieces([piece("a", "add", OUTER)]);
		const cut = foldPieces([
			piece("a", "add", OUTER),
			piece("b", "subtract", INNER),
		]);
		expect(regionContains(full, [13.365, 52.512])).toBe(true);
		expect(regionContains(cut, [13.365, 52.512])).toBe(false);
		expect(regionContains(cut, [13.42, 52.53])).toBe(true);
		expect(regionArea(cut)).toBeLessThan(regionArea(full));
	});

	it("puts geometry back when an add follows a cut", () => {
		const restored = foldPieces([
			piece("a", "add", OUTER),
			piece("b", "subtract", INNER),
			piece("c", "add", INNER),
		]);
		expect(regionContains(restored, [13.365, 52.512])).toBe(true);
		expect(regionArea(restored)).toBeCloseTo(
			regionArea(foldPieces([piece("a", "add", OUTER)])),
			-2,
		);
	});

	it("is empty when a cut takes everything", () => {
		const folded = foldPieces([
			piece("a", "add", INNER),
			piece("b", "subtract", OUTER),
		]);
		expect(folded.polygons).toHaveLength(0);
	});
});

describe("nameFromPieces", () => {
	it("uses the single add's name", () => {
		expect(nameFromPieces([piece("a", "add", OUTER, "Mitte")])).toBe("Mitte");
	});

	it("counts when more than one add is in play", () => {
		expect(
			nameFromPieces([
				piece("a", "add", OUTER, "Mitte"),
				piece("b", "add", INNER, "A park"),
			]),
		).toBe("2 pieces");
	});
});

describe("piecesFromSelection", () => {
	it("keeps a composed list as itself", () => {
		const pieces = [piece("a", "add", OUTER, "Mitte")];
		expect(
			piecesFromSelection(composedSelection(pieces), "ignored", "x"),
		).toEqual(pieces);
	});

	it("does not seed the starter board as a piece", () => {
		const selection = drawnSelection([
			[13.29, 52.46],
			[13.51, 52.46],
			[13.51, 52.57],
			[13.29, 52.57],
			[13.29, 52.46],
		]);
		expect(piecesFromSelection(selection, "All of Berlin", "seed")).toEqual(
			[],
		);
	});
});

describe("buildMap composed", () => {
	it("plays the fold, not the first piece's ring", () => {
		const map = buildMap(
			{
				name: "Mitte less a park",
				scalePreset: "district",
				selection: composedSelection([
					piece("a", "add", OUTER, "Mitte"),
					piece("b", "subtract", INNER, "A park"),
				]),
			},
			BERLIN_FIXTURE_CATALOG,
		);
		expect(map.selection.kind).toBe("composed");
		expect(map.validHidingArea).toEqual(
			regionToMultiPolygon(
				foldPieces([
					piece("a", "add", OUTER, "Mitte"),
					piece("b", "subtract", INNER, "A park"),
				]),
			),
		);
		expect(map.validHidingArea).not.toEqual(OUTER);
	});
});
