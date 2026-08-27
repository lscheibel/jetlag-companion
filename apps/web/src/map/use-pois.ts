import { useEffect, useRef, useState } from "react";
import { type CatalogPoiRow, fetchCatalogPois } from "../builder/api";
import type { Session } from "../session";

/**
 * Amenity pins for the play map. Fetched over HTTP like catalog boundaries —
 * they are not in Zero.
 */
export function usePois(
	session: Session,
	bbox: readonly [number, number, number, number] | null,
	enabled: boolean,
): readonly CatalogPoiRow[] {
	const [rows, setRows] = useState<readonly CatalogPoiRow[]>([]);
	const exact = useRef({ bbox, enabled });
	exact.current = { bbox, enabled };
	const key = enabled && bbox ? bbox.map((n) => n.toFixed(3)).join(",") : null;

	useEffect(() => {
		const { bbox: box, enabled: on } = exact.current;
		if (!key || !box || !on) {
			setRows([]);
			return;
		}
		let live = true;
		fetchCatalogPois(session, box, { all: true })
			.then((result) => {
				if (live) setRows(result.pois);
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
