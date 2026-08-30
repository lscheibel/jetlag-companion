import {
	isPoiKind,
	MODE_IDS,
	type ModeId,
	POI_KIND_FALLBACK,
	POI_KIND_LABELS,
	type PoiKind,
} from "@zero-lag/catalog";

/**
 * What a point of interest can be: an OSM amenity kind, or a type of station.
 *
 * One flat union rather than a tagged pair, because every screen that picks a
 * point of interest — the layer picker, the nearest-cell tool, the all-of-this-
 * type radius — asks the same question of it: what is this one, and which other
 * pins count as the same thing. The two id sets do not collide, and `PoiKind`
 * keeps meaning what it meant, so an amenity stays exactly what it was.
 */
export type PoiTypeId = PoiKind | ModeId;

const STATION_TYPES = new Set<string>(MODE_IDS);

export function isStationType(id: string): id is ModeId {
	return STATION_TYPES.has(id);
}

/**
 * A stored type id, checked back into the union. What a constraint's origin
 * carries is whatever the catalog called it when the cut was made, which a
 * later catalog need not still have.
 */
export function asPoiTypeId(id: string | null | undefined): PoiTypeId | null {
	if (!id) return null;
	if (isStationType(id)) return id;
	return isPoiKind(id) ? id : null;
}

interface StationLabel {
	readonly plural: string;
	readonly singular: string;
}

/**
 * A station type in the words a player uses for the dot, not for the mode. On
 * the setup screens the same eight ids are a decision about what counts as
 * transit ("Bus", "Ferries"); on the map they are things you can stand next to.
 */
const STATION_LABELS: Readonly<Record<ModeId, StationLabel>> = {
	"u-bahn": { plural: "U-Bahn stations", singular: "U-Bahn station" },
	"s-bahn": { plural: "S-Bahn stations", singular: "S-Bahn station" },
	tram: { plural: "Tram stops", singular: "Tram stop" },
	bus: { plural: "Bus stops", singular: "Bus stop" },
	regional: {
		plural: "Regional-train stations",
		singular: "Regional-train station",
	},
	"long-distance": {
		plural: "Long-distance stations",
		singular: "Long-distance station",
	},
	ferry: { plural: "Ferry piers", singular: "Ferry pier" },
	funicular: { plural: "Funicular stations", singular: "Funicular station" },
};

/** Plural, for a list of them. */
export function poiTypeLabel(id: PoiTypeId): string {
	return isStationType(id) ? STATION_LABELS[id].plural : POI_KIND_LABELS[id];
}

/** Singular, for one of them. */
export function poiTypeSingular(id: PoiTypeId): string {
	return isStationType(id)
		? STATION_LABELS[id].singular
		: POI_KIND_FALLBACK[id];
}
