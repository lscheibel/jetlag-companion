import {
	type LngLat,
	type MultiPolygon,
	multiPolygonToRegion,
	regionContains,
} from "@zero-lag/geo";
import { useEffect, useRef, useState } from "react";
import {
	type CatalogBoundaryRow,
	fetchCatalogBoundaries,
} from "../builder/api";
import type { Session } from "../session";

/**
 * Boundaries for the active Bezirk/Ortsteil picker. Fetched over HTTP like
 * catalog stops — they are not in Zero.
 */
export function useBoundaries(
	session: Session,
	bbox: readonly [number, number, number, number] | null,
	adminLevels: readonly (4 | 9 | 10)[],
): readonly CatalogBoundaryRow[] {
	const [rows, setRows] = useState<readonly CatalogBoundaryRow[]>([]);
	const exact = useRef({ bbox, adminLevels });
	exact.current = { bbox, adminLevels };
	const key =
		bbox && adminLevels.length > 0
			? `${[...adminLevels].sort().join(",")}:${bbox.map((n) => n.toFixed(3)).join(",")}`
			: null;

	useEffect(() => {
		const { bbox: box, adminLevels: levels } = exact.current;
		if (!key || !box || levels.length === 0) {
			setRows([]);
			return;
		}
		let live = true;
		Promise.all(
			levels.map((level) => fetchCatalogBoundaries(session, box, level)),
		)
			.then((results) => {
				if (live) setRows(results.flatMap((result) => result.boundaries));
			})
			.catch(() => {
				if (live) setRows([]);
			});
		return () => {
			live = false;
		};
	}, [key, session]);

	return rows;
}

export function boundaryAtPoint(
	rows: readonly CatalogBoundaryRow[],
	point: LngLat,
): CatalogBoundaryRow | null {
	const hits = rows.filter((row) =>
		regionContains(multiPolygonToRegion(row.polygons as MultiPolygon), point),
	);
	if (hits.length === 0) return null;
	const areaOf = (polygons: MultiPolygon): number => {
		let area = 0;
		for (const polygon of polygons) {
			const ring = polygon[0];
			if (!ring || ring.length < 4) continue;
			let minLng = ring[0][0];
			let minLat = ring[0][1];
			let maxLng = ring[0][0];
			let maxLat = ring[0][1];
			for (const [lng, lat] of ring) {
				if (lng < minLng) minLng = lng;
				if (lat < minLat) minLat = lat;
				if (lng > maxLng) maxLng = lng;
				if (lat > maxLat) maxLat = lat;
			}
			area += (maxLng - minLng) * (maxLat - minLat);
		}
		return area;
	};
	return hits.reduce((smallest, row) =>
		areaOf(row.polygons as MultiPolygon) <
		areaOf(smallest.polygons as MultiPolygon)
			? row
			: smallest,
	);
}
