import {
	type BBox,
	distanceMeters,
	type LngLat,
	type Meters,
	multiPolygonBBox,
	offsetLngLat,
	type Region,
	regionContains,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import type { CatalogStop, MaterialisedStop } from "./types";

/**
 * Which stops a game carries. m4-spec §5.
 *
 * A bounding box expanded by a margin, refined in JS — *not* strict containment
 * in the area. An earlier draft materialised by containment, reasoning that a
 * station outside the game means nothing. That was reasoning from the union
 * model, where every station was inside the area by construction. With a drawn
 * polygon it is plainly wrong: seekers travel outside the area constantly, and
 * searching for the station you are changing at is the most ordinary thing in
 * the game.
 */

/**
 * A box, not a polygon buffer, deliberately: `packages/geo` has no offsetting
 * function, buffering an arbitrary polygon is real work, and this is an index
 * rather than a rule — so precision buys nothing.
 */
export function expandBBox(bbox: BBox, marginMeters: Meters): BBox {
	const [minLng, minLat, maxLng, maxLat] = bbox;
	const sw = offsetLngLat([minLng, minLat], -marginMeters, -marginMeters);
	const ne = offsetLngLat([maxLng, maxLat], marginMeters, marginMeters);
	return [sw[0], sw[1], ne[0], ne[1]];
}

export function bboxContains(bbox: BBox, point: LngLat): boolean {
	return (
		point[0] >= bbox[0] &&
		point[0] <= bbox[2] &&
		point[1] >= bbox[1] &&
		point[1] <= bbox[3]
	);
}

export function stopsInBBox(
	stops: readonly CatalogStop[],
	bbox: BBox,
): CatalogStop[] {
	return stops.filter((stop) => bboxContains(bbox, [stop.lng, stop.lat]));
}

/**
 * Pure in (area, margin, catalog) — which is what makes §7's byte-identity
 * requirement hold by construction rather than by luck. Two devices applying
 * the same share code run this over the same pinned catalog and get the same
 * rows in the same order.
 */
export function materialiseStops(
	stops: readonly CatalogStop[],
	area: Region,
	marginMeters: Meters,
): MaterialisedStop[] {
	const bounds = multiPolygonBBox(regionToMultiPolygon(area));
	if (!bounds) return [];

	const box = expandBBox(bounds, marginMeters);
	const materialised: MaterialisedStop[] = [];
	for (const stop of stops) {
		const position: LngLat = [stop.lng, stop.lat];
		if (!bboxContains(box, position)) continue;
		materialised.push({
			stopId: stop.id,
			name: stop.name,
			lng: stop.lng,
			lat: stop.lat,
			modeIds: stop.modeIds,
			lines: stop.lines ?? [],
			insideArea: regionContains(area, position),
		});
	}
	// Id order, so the rows a config produces are a function of its inputs and
	// nothing else. m4-spec §7.
	materialised.sort((a, b) => (a.stopId < b.stopId ? -1 : 1));
	return materialised;
}

/**
 * The second of §3's two advisory predicates: a hiding spot is valid if it is
 * inside the area *and* within the hiding radius of a station in play.
 *
 * This is the point reading of the station rule, and it is the reason deferring
 * the union of station discs costs the *fold* precision and costs the *rule*
 * nothing. A linear scan: 0.77 ms over the 4,473 stations a Berlin-sized game
 * carries, which is not a number worth indexing away.
 */
export function nearestStationMeters(
	spot: LngLat,
	stops: readonly { readonly lng: number; readonly lat: number }[],
): Meters {
	let best = Number.POSITIVE_INFINITY;
	for (const stop of stops) {
		const d = distanceMeters(spot, [stop.lng, stop.lat]);
		if (d < best) best = d;
	}
	return best;
}
