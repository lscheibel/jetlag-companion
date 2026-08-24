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
		fetchCatalogStops(session, bbox)
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
