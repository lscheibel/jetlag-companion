import type { BBox, LngLat, Meters, MultiPolygon } from "@zero-lag/geo";

export type TransitMode = {
	readonly id: string;
	readonly name: string;
};

export type TransitLine = {
	readonly id: string;
	readonly modeId: string;
	readonly name: string;
	readonly stopIds: readonly string[];
};

export type TransitStop = {
	readonly id: string;
	readonly name: string;
	readonly position: LngLat;
	readonly modeIds: readonly string[];
};

export type AdminBoundary = {
	readonly id: string;
	readonly name: string;
	readonly polygons: MultiPolygon;
};

/**
 * A versioned, content-hashed dataset. The stop list is a *candidate*
 * inventory — what a builder session emits is what a game actually uses.
 * m0-spec §11.
 */
export type AreaPack = {
	readonly id: string;
	readonly version: string;
	readonly contentHash: string;
	readonly name: string;
	readonly bounds: BBox;
	readonly modes: readonly TransitMode[];
	readonly lines: readonly TransitLine[];
	readonly stops: readonly TransitStop[];
	/** Districts and the like — matching questions and area selection. */
	readonly boundaries: readonly AdminBoundary[];
};

/**
 * What a host's builder session produces. M0 hand-writes one; M4 generates them.
 * m0-spec §11.
 */
export type MapConfig = {
	readonly id: string;
	readonly gameId: string;
	readonly areaPackId: string;
	readonly areaPackVersion: string;

	/**
	 * Stored, not recomputed from `enabledStopIds`.
	 *
	 * It will often be heavily hand-customised — drawn additions, carve-outs,
	 * imported geometry by M18 — so it is not reproducible from the stop list
	 * plus a radius, and treating it as derived would silently discard a host's
	 * work.
	 */
	readonly validHidingArea: MultiPolygon;

	readonly enabledStopIds: readonly string[];
	readonly hidingRadiusByMode: Readonly<Record<string, Meters>>;
	readonly contentHash: string;
};
