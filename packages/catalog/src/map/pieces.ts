import {
	EMPTY_REGION,
	type MultiPolygon,
	multiPolygonToRegion,
	normalizeRegion,
	type Region,
	regionToMultiPolygon,
	subtractRegions,
	unionRegions,
} from "@zero-lag/geo";
import type { AreaPiece, Selection } from "@zero-lag/schema";
import { buildValidHidingArea } from "./area";

/**
 * Fold an ordered list of add/cut pieces into the area a game is played on.
 *
 * Order is the whole point: a district added after a subtraction puts part of
 * it back, which is why the list is stored rather than the union.
 */
export function foldPieces(pieces: readonly AreaPiece[]): Region {
	let acc = EMPTY_REGION;
	for (const piece of pieces) {
		if (piece.geometry.length === 0) continue;
		const next = multiPolygonToRegion(piece.geometry);
		acc =
			piece.op === "add" ? unionRegions(acc, next) : subtractRegions(acc, next);
	}
	return normalizeRegion(acc);
}

export function foldPiecesToMultiPolygon(
	pieces: readonly AreaPiece[],
): MultiPolygon {
	return regionToMultiPolygon(foldPieces(pieces));
}

export function composedSelection(
	pieces: readonly AreaPiece[],
): Extract<Selection, { kind: "composed" }> {
	return { kind: "composed", pieces };
}

/**
 * A name the rest of the wizard can wear. One add is that piece; anything
 * mixed is counted rather than guessed.
 */
export function nameFromPieces(pieces: readonly AreaPiece[]): string {
	const adds = pieces.filter((piece) => piece.op === "add");
	if (adds.length === 1) return adds[0]?.name ?? "Custom area";
	if (pieces.length === 0) return "Custom area";
	return `${pieces.length} pieces`;
}

/**
 * Re-open the editor from whatever the board currently stores.
 *
 * The game still opens on a drawn starter so the catalog has something to
 * count, but that board is not a choice the host has made — so it does not
 * become a piece. A ring they drew themselves does.
 */
export function piecesFromSelection(
	selection: Selection,
	name: string,
	id: string,
): AreaPiece[] {
	if (selection.kind === "composed") return [...selection.pieces];
	if (name === "All of Berlin") return [];
	return [
		{
			id,
			op: "add",
			source: "drawn",
			name,
			geometry: selection.polygon,
		},
	];
}

export function areaFromSelection(selection: Selection): Region {
	if (selection.kind === "composed") return foldPieces(selection.pieces);
	const ring = selection.polygon[0]?.[0] ?? [];
	return buildValidHidingArea(ring);
}
