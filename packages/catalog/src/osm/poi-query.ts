import type { BBox } from "@zero-lag/geo";
import { bboxContains } from "../stops/materialise";
import type { CatalogPoi } from "./poi";
import { isPoiKind } from "./poi-kinds";

export function poisInBBox(
	catalog: readonly CatalogPoi[],
	bbox: BBox,
): CatalogPoi[] {
	return catalog.filter((row) => bboxContains(bbox, [row.lng, row.lat]));
}

export function poisFromJson(parsed: unknown): CatalogPoi[] | null {
	const rows = unwrapPois(parsed);
	if (!rows) return null;
	const out: CatalogPoi[] = [];
	for (const row of rows) {
		const poi = asCatalogPoi(row);
		if (poi) out.push(poi);
	}
	return out;
}

function unwrapPois(parsed: unknown): unknown[] | null {
	if (Array.isArray(parsed)) return parsed;
	if (
		typeof parsed === "object" &&
		parsed !== null &&
		"pois" in parsed &&
		Array.isArray(parsed.pois)
	) {
		return parsed.pois;
	}
	return null;
}

function asCatalogPoi(row: unknown): CatalogPoi | null {
	if (typeof row !== "object" || row === null) return null;
	if (
		!("id" in row) ||
		!("name" in row) ||
		!("kind" in row) ||
		!("lng" in row) ||
		!("lat" in row)
	) {
		return null;
	}
	if (
		typeof row.id !== "string" ||
		typeof row.name !== "string" ||
		typeof row.kind !== "string" ||
		typeof row.lng !== "number" ||
		typeof row.lat !== "number"
	) {
		return null;
	}
	if (!isPoiKind(row.kind)) return null;
	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		lng: row.lng,
		lat: row.lat,
	};
}
