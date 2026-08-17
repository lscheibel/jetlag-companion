import { contentHash, type JsonValue } from "@zero-lag/geo";
import type { AreaPack, MapConfig } from "./types";

/**
 * The hash covers everything that changes what the pack means, and nothing
 * else — the hash field itself is excluded, or it could never be computed.
 */
export function areaPackContentHash(
	pack: Omit<AreaPack, "contentHash">,
): string {
	return contentHash({
		id: pack.id,
		version: pack.version,
		name: pack.name,
		bounds: [...pack.bounds],
		modes: pack.modes.map((mode) => ({ ...mode })),
		lines: pack.lines.map((line) => ({ ...line, stopIds: [...line.stopIds] })),
		stops: pack.stops.map((stop) => ({
			...stop,
			position: [...stop.position],
			modeIds: [...stop.modeIds],
		})),
		boundaries: pack.boundaries.map((boundary) => ({
			id: boundary.id,
			name: boundary.name,
			polygons: toJson(boundary.polygons),
		})),
	} as JsonValue);
}

/**
 * The map config's hash is half of the search-area cache key, so it must move
 * whenever anything that changes a fold changes — the seed area above all.
 */
export function mapConfigContentHash(
	config: Omit<MapConfig, "contentHash">,
): string {
	return contentHash({
		areaPackId: config.areaPackId,
		areaPackVersion: config.areaPackVersion,
		validHidingArea: toJson(config.validHidingArea),
		enabledStopIds: [...config.enabledStopIds].sort(),
		hidingRadiusByMode: { ...config.hidingRadiusByMode },
	} as JsonValue);
}

function toJson(
	polygons: MapConfig["validHidingArea"],
): readonly (readonly (readonly (readonly number[])[])[])[] {
	return polygons.map((polygon) =>
		polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
	);
}
