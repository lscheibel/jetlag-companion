import proj4 from "proj4";
import type { LngLat, Projection, Projector, XY } from "./types";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/** UTM 33N — the projection Berlin/VBB is built in. */
export const UTM_33N =
	"+proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs";

export const BERLIN_PROJECTION: Projection = {
	proj4: UTM_33N,
	snapPrecisionMeters: 0.1,
	simplifyToleranceMeters: 1,
};

const converters = new Map<string, proj4.Converter>();

function converterFor(def: string): proj4.Converter {
	const cached = converters.get(def);
	if (cached) return cached;
	const made = proj4(WGS84, def);
	converters.set(def, made);
	return made;
}

export function createProjector(projection: Projection): Projector {
	const converter = converterFor(projection.proj4);
	return {
		projection,
		forward(p: LngLat): XY {
			const [x, y] = converter.forward([p[0], p[1]]);
			return [x, y];
		},
		inverse(p: XY): LngLat {
			const [lng, lat] = converter.inverse([p[0], p[1]]);
			return [lng, lat];
		},
	};
}
