import {
	isEmptyRegion,
	type MultiPolygon,
	multiPolygonBBox,
	multiPolygonToRegion,
	type Region,
	regionHash,
	regionToMultiPolygon,
	subtractRegions,
} from "@zero-lag/geo";
import { type Constraint, foldConstraints } from "@zero-lag/rules";

/**
 * A constraint row as the map fold consumes it. The Zero row is a superset;
 * this is the slice that changes the surviving area.
 */
export type FoldableConstraint = {
	readonly id: string;
	readonly hiderTeamId: string;
	readonly enabled: boolean;
	readonly geometry: Constraint["geometry"];
	readonly mode: Constraint["mode"];
};

export type SearchArea = {
	readonly surviving: Region | null;
	readonly eliminated: MultiPolygon | null;
	readonly hash: string | null;
};

/**
 * Surviving search area for one (seeker, hider) pair, and the mask that paints
 * everything outside it.
 *
 * The engine folds over WORLD. The overlay does not: a globe-sized GeoJSON
 * polygon is a MapLibre antimeridian trap, so the mask is clipped to a padded
 * bounding box of the game area. The hash is of the unclipped surviving region,
 * which is what two phones must agree on.
 */
export function survivingSearchArea(
	seed: MultiPolygon | null,
	constraints: readonly FoldableConstraint[],
	hiderTeamId: string | null,
): SearchArea {
	if (!seed || seed.length === 0) {
		return { surviving: null, eliminated: null, hash: null };
	}
	const seedRegion = multiPolygonToRegion(seed);
	const enabled: Constraint[] = hiderTeamId
		? constraints
				.filter((row) => row.enabled && row.hiderTeamId === hiderTeamId)
				.map((row) => ({
					id: row.id,
					geometry: row.geometry,
					mode: row.mode,
				}))
		: [];
	const surviving = foldConstraints(seedRegion, enabled);
	const eliminatedRegion = subtractRegions(paddedFrame(seed), surviving);
	return {
		surviving,
		eliminated: isEmptyRegion(eliminatedRegion)
			? null
			: regionToMultiPolygon(eliminatedRegion),
		hash: regionHash(surviving),
	};
}

function paddedFrame(seed: MultiPolygon): Region {
	const bbox = multiPolygonBBox(seed);
	if (!bbox) return multiPolygonToRegion(seed);
	const padLng = Math.max((bbox[2] - bbox[0]) * 0.25, 0.02);
	const padLat = Math.max((bbox[3] - bbox[1]) * 0.25, 0.02);
	const west = bbox[0] - padLng;
	const south = bbox[1] - padLat;
	const east = bbox[2] + padLng;
	const north = bbox[3] + padLat;
	return {
		polygons: [
			[
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south],
				],
			],
		],
	};
}
