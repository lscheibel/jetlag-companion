import type { BBox } from "@zero-lag/geo";
import { useEffect, useRef, useState } from "react";
import { type CatalogStopRow, fetchCatalogStops } from "../../builder/api";
import type { Session } from "../../session";

interface CatalogView {
	readonly stops: readonly CatalogStopRow[];
	readonly truncated: boolean;
}

const NO_STOPS: CatalogView = { stops: [], truncated: false };

/**
 * Stations just outside the fold still belong on the preview: a circle snaps
 * to them, and the edge of the area is where you look for a neighbouring stop.
 * Twenty percent of the box, and at least about a kilometre in Berlin, so a
 * tiny first piece still reaches past its own outline.
 */
function padCatalogBBox(bbox: BBox): BBox {
	const padLng = Math.max((bbox[2] - bbox[0]) * 0.2, 0.02);
	const padLat = Math.max((bbox[3] - bbox[1]) * 0.2, 0.015);
	return [
		bbox[0] - padLng,
		bbox[1] - padLat,
		bbox[2] + padLng,
		bbox[3] + padLat,
	];
}

/**
 * Catalog stops for the editor preview, debounced on a rounded bbox the same
 * way the M4 builder does — it is a network call, not a compute cost.
 */
export function useCatalogStops(
	session: Session,
	bounds: BBox | null,
): CatalogView {
	const [view, setView] = useState<CatalogView>(NO_STOPS);
	const exact = useRef(bounds);
	exact.current = bounds;
	const key = bounds ? bounds.map((n) => n.toFixed(3)).join(",") : null;

	useEffect(() => {
		const bbox = exact.current;
		if (!key || !bbox) {
			setView(NO_STOPS);
			return;
		}
		let live = true;
		fetchCatalogStops(session, padCatalogBBox(bbox), { all: true })
			.then((result) => {
				if (live) setView({ stops: result.stops, truncated: result.truncated });
			})
			.catch(() => {
				if (live) setView(NO_STOPS);
			});
		return () => {
			live = false;
		};
	}, [key, session]);

	return view;
}
