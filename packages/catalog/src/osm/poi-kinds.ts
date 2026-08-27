/**
 * The amenity kinds the play map can plot, in the order the picker lists them.
 *
 * Transit stops are GTFS, not OSM, and are not in this list.
 */

export const POI_KINDS = [
	"museum",
	"library",
	"castle",
	"water_park",
	"theatre",
	"stadium",
	"hospital",
	"gallery",
	"cinema",
	"zoo",
	"theme_park",
	"aquarium",
	"park",
	"mountain",
	"golf_course",
	"consulate",
] as const;

export type PoiKind = (typeof POI_KINDS)[number];

export const POI_KIND_LABELS: Readonly<Record<PoiKind, string>> = {
	museum: "Museums",
	library: "Libraries",
	castle: "Castles",
	water_park: "Water parks",
	theatre: "Theatres",
	stadium: "Stadiums",
	hospital: "Hospitals",
	gallery: "Galleries",
	cinema: "Cinemas",
	zoo: "Zoos",
	theme_park: "Theme parks",
	aquarium: "Aquariums",
	park: "Parks",
	mountain: "Mountains",
	golf_course: "Golf courses",
	consulate: "Foreign consulates",
};

/** Singular, for a feature that has no `name` tag. */
export const POI_KIND_FALLBACK: Readonly<Record<PoiKind, string>> = {
	museum: "Museum",
	library: "Library",
	castle: "Castle",
	water_park: "Water park",
	theatre: "Theatre",
	stadium: "Stadium",
	hospital: "Hospital",
	gallery: "Gallery",
	cinema: "Cinema",
	zoo: "Zoo",
	theme_park: "Theme park",
	aquarium: "Aquarium",
	park: "Park",
	mountain: "Mountain",
	golf_course: "Golf course",
	consulate: "Foreign consulate",
};

const TAG_MATCH: readonly {
	readonly kind: PoiKind;
	readonly key:
		| "amenity"
		| "tourism"
		| "historic"
		| "leisure"
		| "natural"
		| "diplomatic";
	readonly value: string;
}[] = [
	{ kind: "museum", key: "tourism", value: "museum" },
	{ kind: "library", key: "amenity", value: "library" },
	{ kind: "castle", key: "historic", value: "castle" },
	{ kind: "water_park", key: "leisure", value: "water_park" },
	{ kind: "theatre", key: "amenity", value: "theatre" },
	{ kind: "stadium", key: "leisure", value: "stadium" },
	{ kind: "hospital", key: "amenity", value: "hospital" },
	{ kind: "gallery", key: "tourism", value: "gallery" },
	{ kind: "cinema", key: "amenity", value: "cinema" },
	{ kind: "zoo", key: "tourism", value: "zoo" },
	{ kind: "theme_park", key: "tourism", value: "theme_park" },
	{ kind: "aquarium", key: "tourism", value: "aquarium" },
	{ kind: "park", key: "leisure", value: "park" },
	{ kind: "mountain", key: "natural", value: "peak" },
	{ kind: "golf_course", key: "leisure", value: "golf_course" },
	{ kind: "consulate", key: "diplomatic", value: "consulate" },
];

export function isPoiKind(value: string): value is PoiKind {
	return (POI_KINDS as readonly string[]).includes(value);
}

export function poiKindFromTags(tags: {
	readonly amenity?: string;
	readonly tourism?: string;
	readonly historic?: string;
	readonly leisure?: string;
	readonly natural?: string;
	readonly diplomatic?: string;
}): PoiKind | null {
	for (const rule of TAG_MATCH) {
		if (tags[rule.key] === rule.value) return rule.kind;
	}
	return null;
}
