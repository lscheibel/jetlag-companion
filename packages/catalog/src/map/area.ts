import {
	EMPTY_REGION,
	type LngLat,
	multiPolygonToRegion,
	normalizeRegion,
	type Region,
	type Ring,
	unionRegions,
} from "@zero-lag/geo";

/**
 * Turn the ring a host drew into the area a game is played on. m4-spec §3.
 *
 * A tapped ring can cross itself — it is a person's finger on a phone, not a
 * validated input — and a self-intersecting ring is not a polygon. The repair
 * is **a union of the ring with itself**: `polygon-clipping`'s sweep resolves
 * the crossing into the two lobes the host visibly drew, which is the reading
 * that matches what is on screen.
 *
 * Unioning with `EMPTY_REGION` does *not* work and the mistake is worth
 * recording: union with an empty multipolygon yields empty, so the ring
 * vanishes rather than being repaired.
 */
export function buildValidHidingArea(ring: Ring): Region {
	const closed = closeRing(ring);
	if (closed.length < 4) return EMPTY_REGION;
	const raw = multiPolygonToRegion([[closed]]);
	return normalizeRegion(unionRegions(raw, raw));
}

/** A drawn ring arrives open — the host taps the first vertex to finish. */
export function closeRing(ring: Ring): Ring {
	if (ring.length < 3) return ring;
	const first = ring[0] as LngLat;
	const last = ring[ring.length - 1] as LngLat;
	return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}
