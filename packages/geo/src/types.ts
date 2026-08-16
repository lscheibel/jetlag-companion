/**
 * Two coordinate worlds live in this package and they are never mixed.
 *
 * `LngLat` and the GeoJSON-shaped types built on it are geographic degrees.
 * That is what gets stored, transmitted and rendered.
 *
 * `XY` and the `*XY` types are projected metres in the map config's CRS.
 * That is where every boolean operation happens. m0-spec §9: all boolean
 * operations happen in a projected, metric CRS, never in degrees.
 */

export type LngLat = readonly [lng: number, lat: number];
export type Meters = number;

export type Ring = readonly LngLat[];
export type Polygon = readonly Ring[];
export type MultiPolygon = readonly Polygon[];

/** minLng, minLat, maxLng, maxLat */
export type BBox = readonly [number, number, number, number];

export type XY = readonly [x: number, y: number];

export type RingXY = readonly XY[];
export type PolygonXY = readonly RingXY[];
export type MultiPolygonXY = readonly PolygonXY[];

/**
 * A set of points in projected metres. Every constraint reduces to one of
 * these, and the search area is a fold of intersections over them.
 */
export type Region = {
	readonly polygons: MultiPolygonXY;
};

/**
 * A property of the map config, chosen when the area is built. m0-spec §9.
 */
export type Projection = {
	/** proj4 definition string, e.g. UTM 33N for Berlin */
	readonly proj4: string;
	readonly snapPrecisionMeters: number;
	readonly simplifyToleranceMeters: number;
};

export type Projector = {
	readonly projection: Projection;
	forward(p: LngLat): XY;
	inverse(p: XY): LngLat;
};
