import { useQuery, useZero } from "@rocicorp/zero/react";
import { multiPolygonToRegion, regionArea, regionHash } from "@zero-lag/geo";
import {
	type Constraint,
	foldConstraints,
	searchAreaCacheKey,
} from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { useMemo } from "react";
import { Panel } from "./panel";

/**
 * The fold, on screen. m0-spec §13 defers the map, so what M0 shows is the two
 * numbers that prove the engine ran: the surviving area and the hash of its
 * geometry, which acceptance test 5 compares against the server's.
 */
export function Constraints() {
	const zero = useZero();
	const [games] = useQuery(queries.game());
	const [constraints] = useQuery(queries.constraints());

	const game = games[0];
	const mapConfig = game?.mapConfig;

	const searchArea = useMemo(() => {
		if (!mapConfig) return null;

		const seed = multiPolygonToRegion(mapConfig.validHidingArea);

		const enabled: Constraint[] = constraints
			.filter((row) => row.enabled)
			.map((row) => ({
				id: row.id,
				geometry: row.geometry,
				mode: row.mode,
			}));

		const region = foldConstraints(seed, enabled);
		return {
			areaSquareMeters: regionArea(region),
			hash: regionHash(region),
			cacheKey: searchAreaCacheKey(
				mapConfig.contentHash,
				enabled.map((constraint) => constraint.id),
			),
		};
	}, [mapConfig, constraints]);

	return (
		<Panel testId="constraints" title="Constraints">
			{searchArea ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
					<dt>Search area</dt>
					<dd data-testid="search-area-km2">
						{(searchArea.areaSquareMeters / 1_000_000).toFixed(3)} km²
					</dd>
					<dt>Geometry</dt>
					<dd data-testid="search-area-hash">{searchArea.hash}</dd>
					<dt>Cache key</dt>
					<dd data-testid="search-area-cache-key">{searchArea.cacheKey}</dd>
				</dl>
			) : (
				<p data-testid="search-area-missing">No map config yet.</p>
			)}

			<ul className="space-y-1" data-testid="constraint-list">
				{constraints.map((constraint) => (
					<li className="flex items-center gap-2" key={constraint.id}>
						<span data-testid={`constraint-${constraint.id}`}>
							{constraint.geometry.kind} / {constraint.mode} /{" "}
							{constraint.source}
						</span>
						{/*
						 * Disabling is a column, not a deletion — the same write a hider's
						 * answer correction and the bulk zone invalidation will use.
						 */}
						<button
							className="rounded border px-2 text-xs"
							data-testid={`toggle-${constraint.id}`}
							onClick={() =>
								void zero.mutate(
									mutators.constraint.setEnabled({
										eventId: crypto.randomUUID(),
										constraintId: constraint.id,
										enabled: !constraint.enabled,
									}),
								)
							}
							type="button"
						>
							{constraint.enabled ? "Disable" : "Enable"}
						</button>
					</li>
				))}
			</ul>
		</Panel>
	);
}
