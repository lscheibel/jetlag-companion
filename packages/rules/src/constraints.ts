import {
	circleRegion,
	EMPTY_REGION,
	halfPlaneRegion,
	intersectRegions,
	type LngLat,
	type Meters,
	type MultiPolygon,
	multiPolygonToRegion,
	normalizeRegion,
	type Region,
	regionContains,
	sectorRegion,
	subtractRegions,
	type Tolerances,
	unionRegions,
} from "@zero-lag/geo";

/**
 * Four geometry kinds cover every question in the game and both hand-authored
 * constraint types the build plan defers. m0-spec §9.
 *
 * Radar is a `radius`. Thermometer is a `halfPlane` built from the start and
 * end positions. Matching is a `polygon`. Measuring reduces to a `halfPlane`.
 * Tentacles is a `polygon` — the union of candidate POI buffers. `sector`
 * exists only for hand-authored constraints.
 */
export type ConstraintGeometry =
	| {
			readonly kind: "radius";
			readonly centers: readonly LngLat[];
			readonly radius: Meters;
	  }
	| {
			readonly kind: "halfPlane";
			readonly a: LngLat;
			readonly b: LngLat;
			readonly nearer: "a" | "b";
	  }
	| { readonly kind: "polygon"; readonly polygons: MultiPolygon }
	| {
			readonly kind: "sector";
			readonly center: LngLat;
			readonly radius: Meters;
			readonly fromDeg: number;
			readonly toDeg: number;
	  };

export type ConstraintMode = "include" | "exclude";

export type Constraint = {
	readonly id: string;
	readonly geometry: ConstraintGeometry;
	readonly mode: ConstraintMode;
};

/**
 * Stored radius rows may still have a single `center` from before multi-circle.
 * New writes always use `centers`.
 */
export function radiusCenters(geometry: {
	readonly centers?: readonly LngLat[];
	readonly center?: LngLat;
}): readonly LngLat[] {
	if (geometry.centers && geometry.centers.length > 0) {
		return geometry.centers;
	}
	if (geometry.center) return [geometry.center];
	return [];
}

function radiusRegion(
	geometry: Extract<ConstraintGeometry, { kind: "radius" }>,
): Region {
	const centers = radiusCenters(geometry);
	if (centers.length === 0) return EMPTY_REGION;
	if (centers.length === 1) {
		const only = centers[0];
		if (!only) return EMPTY_REGION;
		return circleRegion(only, geometry.radius);
	}
	return unionRegions(
		...centers.map((center) => circleRegion(center, geometry.radius)),
	);
}

/**
 * The set a constraint refers to, normalized. Not yet the constraint's effect:
 * `mode` decides whether the area is intersected with this set or with its
 * complement.
 */
export function toRegion(
	geometry: ConstraintGeometry,
	tolerances?: Tolerances,
): Region {
	const raw = (() => {
		switch (geometry.kind) {
			case "radius":
				return radiusRegion(geometry);
			case "halfPlane":
				return halfPlaneRegion(geometry.a, geometry.b, geometry.nearer);
			case "polygon":
				return multiPolygonToRegion(geometry.polygons);
			case "sector":
				return sectorRegion(
					geometry.center,
					geometry.radius,
					geometry.fromDeg,
					geometry.toDeg,
				);
		}
	})();
	return normalizeRegion(raw, tolerances);
}

/**
 * Every constraint reduces to *intersect the area with some set*: `include`
 * intersects with S, `exclude` intersects with the complement of S.
 * Intersection is commutative and associative, so the search area does not
 * depend on constraint order. m0-spec §9.
 */
export function applyConstraint(
	area: Region,
	constraint: Constraint,
	tolerances?: Tolerances,
): Region {
	const set = toRegion(constraint.geometry, tolerances);
	const result =
		constraint.mode === "include"
			? intersectRegions(area, set)
			: subtractRegions(area, set);
	return normalizeRegion(result, tolerances);
}

/**
 * The fold is over a *set*, and the signature says so by ignoring the order of
 * `constraints` entirely.
 *
 * The resulting area is order-independent by the argument above. Its byte
 * representation is not: snapping and simplification run between steps, and
 * which vertices they keep depends on which intermediate boundary they saw. So
 * the constraints are sorted by id before folding, and two devices holding the
 * same set produce the same bytes — which is the whole basis of the cache key
 * in `searchAreaCacheKey` being a set rather than a sequence.
 */
export function foldConstraints(
	seed: Region,
	constraints: readonly Constraint[],
	tolerances?: Tolerances,
): Region {
	const ordered = [...constraints].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	return ordered.reduce(
		(area, constraint) => applyConstraint(area, constraint, tolerances),
		normalizeRegion(seed, tolerances),
	);
}

/**
 * The inverse reading of the same definition — M8's hider-side suggestion asks
 * "does this position satisfy the constraint?" where M13 asks "what area
 * survives it?".
 *
 * Two implementations would drift, and the symptom — a hider told "yes, within
 * 3 km" while the seeker's map eliminates the wrong region — reads as a
 * geometry bug long before anyone suspects duplication. So this shares
 * `toRegion` with `applyConstraint` rather than re-deriving the test.
 */
export function satisfies(
	point: LngLat,
	constraint: Constraint,
	tolerances?: Tolerances,
): boolean {
	const inside = regionContains(
		toRegion(constraint.geometry, tolerances),
		point,
	);
	return constraint.mode === "include" ? inside : !inside;
}
