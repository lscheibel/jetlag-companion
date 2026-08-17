import type { LngLat, Meters, Ring } from "./types";

/**
 * The three doors a metre gets in by. m0-spec §9.
 *
 * Every coordinate in this system is WGS84 lng/lat and there is no second CRS.
 * Boolean operations do not need one — they are topological, and the lng/lat
 * mapping preserves every containment result. What does need a metre is
 * constructing geometry from a distance, measuring, and choosing a tolerance,
 * and all three are served from here.
 *
 * Nothing in this file is a projection. `metersPerDegree` is a local derivative
 * of the ellipsoid evaluated at one latitude, which is why it has no zone, no
 * edge and no configuration: a 400 m radius is 400 m in Flensburg and in
 * Garmisch, where a single UTM zone was correct in Berlin and unusable across
 * a Deutschlandticket map.
 */

const DEG = Math.PI / 180;

// WGS84.
const SEMI_MAJOR = 6_378_137;
const FLATTENING = 1 / 298.257223563;
const SEMI_MINOR = SEMI_MAJOR * (1 - FLATTENING);

/** IUGG mean radius — the sphere `ringAreaMeters` is written on. */
const MEAN_RADIUS = 6_371_008.8;

/**
 * A parallel has no length at the pole, so the scale is evaluated just short of
 * it. Nothing in this game is played there, and a division by zero would be a
 * poor way to find that out.
 */
const MAX_SCALE_LAT = 89.9;

export type DegreeScale = {
	/** Metres in one degree of latitude, at this latitude. */
	readonly lat: number;
	/** Metres in one degree of longitude, at this latitude. */
	readonly lng: number;
};

/**
 * The WGS84 series for the length of a degree, accurate to well under a
 * centimetre.
 *
 * The meridian degree runs from 110,574 m at the equator to 111,694 m at the
 * pole. Using the equatorial figure everywhere — which is what this package did
 * until M3 — draws a Berlin circle 0.64% too large north–south and 0.4% out of
 * round. Invisible under an accuracy ring; a bug report next to a ruler.
 */
export function metersPerDegree(lat: number): DegreeScale {
	const phi = Math.min(MAX_SCALE_LAT, Math.max(-MAX_SCALE_LAT, lat)) * DEG;
	return {
		lat:
			111_132.92 -
			559.82 * Math.cos(2 * phi) +
			1.175 * Math.cos(4 * phi) -
			0.0023 * Math.cos(6 * phi),
		lng:
			111_412.84 * Math.cos(phi) -
			93.5 * Math.cos(3 * phi) +
			0.118 * Math.cos(5 * phi),
	};
}

/**
 * Place a metre offset on the ellipsoid — the single door construction uses.
 *
 * Every circle, sector and half-plane in the engine is built by walking metres
 * from a known point and landing here, so there is one implementation of
 * "metres to degrees" rather than one per shape. m0-spec §9.
 *
 * Two corrections earn their place. The northing is evaluated at the midpoint
 * of the move rather than at its start, because the meridian degree varies with
 * latitude and a long northing evaluated only at the origin drifts. The easting
 * is then placed at the latitude it actually lands on rather than the one it
 * left, because the parallel shrinks going north — which is the term that makes
 * a large circle an egg if you skip it.
 */
export function offsetLngLat(
	origin: LngLat,
	east: Meters,
	north: Meters,
): LngLat {
	const rough = origin[1] + north / metersPerDegree(origin[1]).lat;
	const lat = origin[1] + north / metersPerDegree((origin[1] + rough) / 2).lat;
	return [origin[0] + east / metersPerDegree(lat).lng, lat];
}

/**
 * Vincenty's inverse solution on WGS84 — the distance two points are apart on
 * the ground, to the millimetre.
 *
 * Haversine on a mean sphere was the alternative and carries up to 0.5% error:
 * nothing at 1.4 km, two kilometres across Germany. This is the one number a
 * player reads as a fact, and the build plan's seventh principle says the same
 * product is played at both scales.
 */
export function distanceMeters(a: LngLat, b: LngLat): Meters {
	const L = (b[0] - a[0]) * DEG;
	const U1 = Math.atan((1 - FLATTENING) * Math.tan(a[1] * DEG));
	const U2 = Math.atan((1 - FLATTENING) * Math.tan(b[1] * DEG));
	const sinU1 = Math.sin(U1);
	const cosU1 = Math.cos(U1);
	const sinU2 = Math.sin(U2);
	const cosU2 = Math.cos(U2);

	let lambda = L;
	let sinSigma = 0;
	let cosSigma = 0;
	let sigma = 0;
	let cosSqAlpha = 0;
	let cos2SigmaM = 0;

	for (let iteration = 0; iteration < 200; iteration++) {
		const sinLambda = Math.sin(lambda);
		const cosLambda = Math.cos(lambda);
		const sinSqSigma =
			(cosU2 * sinLambda) ** 2 +
			(cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2;
		// The two points coincide; every later term divides by this.
		if (sinSqSigma === 0) return 0;

		sinSigma = Math.sqrt(sinSqSigma);
		cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
		sigma = Math.atan2(sinSigma, cosSigma);
		const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
		cosSqAlpha = 1 - sinAlpha * sinAlpha;
		// Zero on an equatorial line, where there is no midpoint to speak of.
		cos2SigmaM =
			cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

		const C =
			(FLATTENING / 16) * cosSqAlpha * (4 + FLATTENING * (4 - 3 * cosSqAlpha));
		const previous = lambda;
		lambda =
			L +
			(1 - C) *
				FLATTENING *
				sinAlpha *
				(sigma +
					C *
						sinSigma *
						(cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

		if (Math.abs(lambda - previous) < 1e-12) {
			const uSq =
				(cosSqAlpha * (SEMI_MAJOR * SEMI_MAJOR - SEMI_MINOR * SEMI_MINOR)) /
				(SEMI_MINOR * SEMI_MINOR);
			const A =
				1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
			const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
			const deltaSigma =
				B *
				sinSigma *
				(cos2SigmaM +
					(B / 4) *
						(cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
							(B / 6) *
								cos2SigmaM *
								(-3 + 4 * sinSigma * sinSigma) *
								(-3 + 4 * cos2SigmaM * cos2SigmaM)));
			return SEMI_MINOR * A * (sigma - deltaSigma);
		}
	}

	// Vincenty fails to converge only for near-antipodal points, which no pair
	// of positions in one game can be. Haversine is the honest answer for a case
	// that cannot arise rather than a silent NaN for one that might.
	return haversineMeters(a, b);
}

function haversineMeters(a: LngLat, b: LngLat): Meters {
	const dLat = (b[1] - a[1]) * DEG;
	const dLng = (b[0] - a[0]) * DEG;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
	return 2 * MEAN_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The signed area a closed lng/lat ring encloses, in square metres.
 *
 * Spherical excess on the mean radius, which is what turf and every other
 * implementation of this uses. It carries the sphere-versus-ellipsoid error of
 * a few tenths of a percent, and M13's headline number is a *ratio* of two of
 * these, where that error cancels.
 *
 * Not to be confused with the planar shoelace in `region.ts`, which answers a
 * different question — which way is this ring wound, and did it collapse — and
 * wants degrees rather than metres to answer it.
 */
export function ringAreaMeters(ring: Ring): number {
	if (ring.length < 4) return 0;
	let total = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [lng1, lat1] = ring[i] as LngLat;
		const [lng2, lat2] = ring[i + 1] as LngLat;
		total +=
			(lng2 - lng1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG));
	}
	return (total * MEAN_RADIUS * MEAN_RADIUS) / 2;
}
