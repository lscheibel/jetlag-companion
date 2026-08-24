import type { BBox } from "@zero-lag/geo";
import { useEffect, useRef, useState } from "react";
import {
	type CatalogBoundaryRow,
	fetchBoundarySearch,
} from "../../builder/api";
import type { Session } from "../../session";

const DEBOUNCE_MS = 200;

export interface BoundarySearchView {
	readonly rows: readonly CatalogBoundaryRow[];
	readonly total: number;
	readonly truncated: boolean;
	readonly ready: boolean;
}

const EMPTY: BoundarySearchView = {
	rows: [],
	total: 0,
	truncated: false,
	ready: false,
};

/**
 * Germany-wide place search for the setup picker. The play map still loads
 * by bbox; this one must not, or the phone would download the country.
 */
export function useBoundarySearch(
	session: Session,
	levels: readonly (4 | 9 | 10)[],
	query: string,
	bbox: BBox | null,
): BoundarySearchView {
	const [debounced, setDebounced] = useState(query);
	const [view, setView] = useState<BoundarySearchView>(EMPTY);
	const levelKey = levels.slice().sort().join(",");
	const bboxKey = bbox ? bbox.map((n) => n.toFixed(3)).join(",") : "";
	const lastLevels = useRef(levelKey);
	const exact = useRef({ levels, bbox });
	exact.current = { levels, bbox };

	if (lastLevels.current !== levelKey) {
		lastLevels.current = levelKey;
		setDebounced(query);
		setView(EMPTY);
	}

	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		const { levels: nextLevels, bbox: nextBbox } = exact.current;
		if (nextLevels.length === 0) {
			setView({ ...EMPTY, ready: true });
			return;
		}
		let live = true;
		setView((current) => ({ ...current, ready: false }));
		fetchBoundarySearch(session, nextLevels, debounced, nextBbox)
			.then((result) => {
				if (!live) return;
				setView({
					rows: result.boundaries,
					total: result.total,
					truncated: result.truncated,
					ready: true,
				});
			})
			.catch(() => {
				if (live) setView({ ...EMPTY, ready: true });
			});
		return () => {
			live = false;
		};
	}, [session, levelKey, debounced, bboxKey]);

	return {
		...view,
		ready: view.ready && query.trim() === debounced.trim(),
	};
}
