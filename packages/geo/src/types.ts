/**
 * One coordinate system, everywhere: WGS84 lng/lat. m0-spec §9.
 *
 * There is no second CRS, no stored projection and no forward/inverse round
 * trip in this package. What Postgres holds, what the wire carries, what
 * GeoJSON mandates and what MapLibre draws are all the same numbers, which is
 * the point — there was never a frame to get wrong, so nothing can be in the
 * wrong one.
 *
 * An earlier draft carried a parallel `XY` family in projected metres, with
 * every boolean operation happening there. Booleans are topological and need no
 * metric; see `geodesic.ts` for the three places that do.
 */

export type LngLat = readonly [lng: number, lat: number];
export type Meters = number;

export type Ring = readonly LngLat[];
export type Polygon = readonly Ring[];
export type MultiPolygon = readonly Polygon[];

/** minLng, minLat, maxLng, maxLat */
export type BBox = readonly [number, number, number, number];

/**
 * A set of points on the ellipsoid. Every constraint reduces to one of these,
 * and the search area is a fold of intersections over them.
 */
export type Region = {
	readonly polygons: MultiPolygon;
};

/**
 * How much precision the fold keeps between steps, in metres.
 *
 * Repeated boolean operations on unions of hundreds of circles accumulate
 * degenerate slivers and near-duplicate vertices, so snapping and simplifying
 * between fold steps are part of the engine rather than a later optimisation.
 * Both are stated in metres and converted at the latitude of the geometry they
 * are applied to. m0-spec §9.
 */
export type Tolerances = {
	readonly snapPrecisionMeters: number;
	readonly simplifyToleranceMeters: number;
};
