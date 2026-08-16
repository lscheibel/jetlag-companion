import {
	circleRegion,
	createProjector,
	halfPlaneRegion,
	intersectRegions,
	type LngLat,
	type Meters,
	type MultiPolygon,
	multiPolygonToRegion,
	normalizeRegion,
	type Projection,
	type Region,
	regionContainsXY,
	sectorRegion,
	subtractRegions,
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
			readonly center: LngLat;
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
 * The set a constraint refers to, normalized. Not yet the constraint's effect:
 * `mode` decides whether the area is intersected with this set or with its
 * complement.
 */
export function toRegion(
	geometry: ConstraintGeometry,
	projection: Projection,
): Region {
	const projector = createProjector(projection);
	const raw = (() => {
		switch (geometry.kind) {
			case "radius":
				return circleRegion(
					projector.forward(geometry.center),
					geometry.radius,
				);
			case "halfPlane":
				return halfPlaneRegion(
					projector.forward(geometry.a),
					projector.forward(geometry.b),
					geometry.nearer,
				);
			case "polygon":
				return multiPolygonToRegion(geometry.polygons, projector);
			case "sector":
				return sectorRegion(
					projector.forward(geometry.center),
					geometry.radius,
					geometry.fromDeg,
					geometry.toDeg,
				);
		}
	})();
	return normalizeRegion(raw, projection);
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
	projection: Projection,
): Region {
	const set = toRegion(constraint.geometry, projection);
	const result =
		constraint.mode === "include"
			? intersectRegions(area, set)
			: subtractRegions(area, set);
	return normalizeRegion(result, projection);
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
	projection: Projection,
): Region {
	const ordered = [...constraints].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	return ordered.reduce(
		(area, constraint) => applyConstraint(area, constraint, projection),
		normalizeRegion(seed, projection),
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
	projection: Projection,
): boolean {
	const projector = createProjector(projection);
	const inside = regionContainsXY(
		toRegion(constraint.geometry, projection),
		projector.forward(point),
	);
	return constraint.mode === "include" ? inside : !inside;
}
