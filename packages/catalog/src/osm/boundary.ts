import {
	type MultiPolygon,
	multiPolygonToRegion,
	type Region,
} from "@zero-lag/geo";
import { z } from "zod";
import { MAX_ADMIN_LEVEL, MIN_ADMIN_LEVEL } from "./admin-level";

/**
 * Reads the GeoJSON-seq that `infra/osm/extract-boundaries.sh` produces — one
 * feature per line, straight out of `osmium export`.
 *
 * The shapes here are not hypothetical. They were taken from osmium 1.15.0
 * output and the tests below assert against lines it actually wrote, because
 * every assumption this project made about a data format before opening the
 * file turned out to be wrong (m4-spec §4).
 */

const positionSchema = z.tuple([z.number(), z.number()]);
/** A closed ring: first position repeated last, so four is the minimum. */
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(ringSchema).min(1);

/**
 * osmium emits every assembled area as a MultiPolygon, including single-ring
 * ones, but Polygon is accepted so the parser is not hostage to that detail.
 */
const areaGeometrySchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("Polygon"), coordinates: polygonSchema }),
	z.object({
		type: z.literal("MultiPolygon"),
		coordinates: z.array(polygonSchema).min(1),
	}),
]);

/**
 * `@type` and `@id` come from the `attributes` block in export-config.json;
 * everything else is an OSM tag and is therefore optional no matter how
 * reliably it appears in practice.
 */
const propertiesSchema = z.object({
	"@type": z.enum(["relation", "way", "node"]),
	"@id": z.number().int(),
	admin_level: z.string().optional(),
	name: z.string().optional(),
	"name:prefix": z.string().optional(),
	official_name: z.string().optional(),
	"de:regionalschluessel": z.string().optional(),
	"de:amtlicher_gemeindeschluessel": z.string().optional(),
	"ref:nuts": z.string().optional(),
	wikidata: z.string().optional(),
});

const featureSchema = z.object({
	type: z.literal("Feature"),
	geometry: z.unknown(),
	properties: propertiesSchema,
});

export type OsmObjectType = z.infer<typeof propertiesSchema>["@type"];

export interface ParsedBoundary {
	readonly osmType: OsmObjectType;
	readonly osmId: number;
	readonly name: string;
	readonly officialName: string | null;
	readonly adminLevel: number;
	/** OSM's own word for this object, e.g. "Bezirk". See `boundaryLabel`. */
	readonly labelPrefix: string | null;
	/**
	 * The German official key, ARS preferred over AGS.
	 *
	 * This was meant to be the identifier that survives a quarterly re-extract,
	 * OSM relation ids carrying no stability promise. Measured against the real
	 * extract it covers 97% of Gemeinden and **0.4% of Stadtbezirke and
	 * Ortsteile** — absent from the two levels a city game actually selects.
	 * Berlin is one of the exceptions, its Bezirke carrying ARS 11001-11012.
	 * So it is stored where it exists and re-resolution cannot lean on it
	 * (m4-spec §4).
	 */
	readonly officialKey: string | null;
	readonly nuts: string | null;
	readonly wikidata: string | null;
	/** Full detail, unsimplified. Adjacent boundaries share ways, so thinning
	 * them individually opens slivers between neighbours; the selection unions
	 * originals and simplifies once (m4-spec §3). */
	readonly region: Region;
}

export type BoundarySkipReason =
	| "malformed-json"
	| "not-a-feature"
	| "not-an-area"
	| "missing-name"
	| "missing-admin-level"
	| "admin-level-out-of-range";

export type BoundaryParseResult =
	| { readonly ok: true; readonly boundary: ParsedBoundary }
	| {
			readonly ok: false;
			readonly reason: BoundarySkipReason;
			readonly osmId: number | null;
	  };

/** OSM stores admin_level as free text and the wild contains "8;9" and "". */
const ADMIN_LEVEL_PATTERN = /^\d{1,2}$/;

function toMultiPolygon(
	geometry: z.infer<typeof areaGeometrySchema>,
): MultiPolygon {
	return geometry.type === "Polygon"
		? [geometry.coordinates]
		: geometry.coordinates;
}

export function parseBoundaryLine(line: string): BoundaryParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(line);
	} catch {
		return { ok: false, reason: "malformed-json", osmId: null };
	}

	const feature = featureSchema.safeParse(raw);
	if (!feature.success) {
		return { ok: false, reason: "not-a-feature", osmId: null };
	}
	const props = feature.data.properties;
	const osmId = props["@id"];

	// Boundary relations carry admin_centre and label *nodes* as members. The
	// extract drops them with --geometry-types=polygon; this is the second line
	// of defence, because a label node that reaches the catalog looks exactly
	// like a boundary that happens to be very small.
	const geometry = areaGeometrySchema.safeParse(feature.data.geometry);
	if (!geometry.success) {
		return { ok: false, reason: "not-an-area", osmId };
	}

	const name = props.name?.trim();
	if (!name) return { ok: false, reason: "missing-name", osmId };

	const rawLevel = props.admin_level?.trim();
	if (!rawLevel || !ADMIN_LEVEL_PATTERN.test(rawLevel)) {
		return { ok: false, reason: "missing-admin-level", osmId };
	}
	const adminLevel = Number.parseInt(rawLevel, 10);
	if (adminLevel < MIN_ADMIN_LEVEL || adminLevel > MAX_ADMIN_LEVEL) {
		return { ok: false, reason: "admin-level-out-of-range", osmId };
	}

	return {
		ok: true,
		boundary: {
			osmType: props["@type"],
			osmId,
			name,
			officialName: props.official_name?.trim() || null,
			adminLevel,
			labelPrefix: props["name:prefix"]?.trim() || null,
			officialKey:
				props["de:regionalschluessel"]?.trim() ||
				props["de:amtlicher_gemeindeschluessel"]?.trim() ||
				null,
			nuts: props["ref:nuts"]?.trim() || null,
			wikidata: props.wikidata?.trim() || null,
			region: multiPolygonToRegion(toMultiPolygon(geometry.data)),
		},
	};
}
