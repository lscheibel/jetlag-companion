import {
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
} from "@zero-lag/geo";
import { z } from "zod";
import { POI_KIND_FALLBACK, type PoiKind, poiKindFromTags } from "./poi-kinds";

/**
 * Reads one GeoJSON-seq line from `infra/osm/extract-pois.sh`.
 *
 * Nodes stay points. Closed ways and multipolygon relations arrive as
 * Polygon / MultiPolygon; the catalog stores a pin at the outer-ring bbox
 * centre because the play map only plots dots.
 */

const positionSchema = z.tuple([z.number(), z.number()]);
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(ringSchema).min(1);

const geometrySchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("Point"),
		coordinates: positionSchema,
	}),
	z.object({
		type: z.literal("Polygon"),
		coordinates: polygonSchema,
	}),
	z.object({
		type: z.literal("MultiPolygon"),
		coordinates: z.array(polygonSchema).min(1),
	}),
]);

const propertiesSchema = z.object({
	"@type": z.enum(["relation", "way", "node"]),
	"@id": z.number().int(),
	name: z.string().optional(),
	amenity: z.string().optional(),
	tourism: z.string().optional(),
	historic: z.string().optional(),
	leisure: z.string().optional(),
	natural: z.string().optional(),
	diplomatic: z.string().optional(),
	consulate: z.string().optional(),
});

const featureSchema = z.object({
	type: z.literal("Feature"),
	geometry: z.unknown(),
	properties: propertiesSchema,
});

export interface CatalogPoi {
	readonly id: string;
	readonly name: string;
	readonly kind: PoiKind;
	readonly lng: number;
	readonly lat: number;
}

export type PoiSkipReason =
	| "malformed-json"
	| "not-a-feature"
	| "not-a-place"
	| "unknown-kind"
	| "missing-name"
	| "honorary-consul";

export type PoiParseResult =
	| { readonly ok: true; readonly poi: CatalogPoi }
	| {
			readonly ok: false;
			readonly reason: PoiSkipReason;
			readonly osmId: number | null;
	  };

function toMultiPolygon(
	geometry: Extract<
		z.infer<typeof geometrySchema>,
		{ type: "Polygon" | "MultiPolygon" }
	>,
): MultiPolygon {
	return geometry.type === "Polygon"
		? [geometry.coordinates]
		: geometry.coordinates;
}

function placeFromGeometry(
	geometry: z.infer<typeof geometrySchema>,
): LngLat | null {
	if (geometry.type === "Point") return geometry.coordinates;
	const bbox = multiPolygonBBox(toMultiPolygon(geometry));
	if (!bbox) return null;
	return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function parsePoiLine(line: string): PoiParseResult {
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

	const kind = poiKindFromTags(props);
	if (!kind) return { ok: false, reason: "unknown-kind", osmId };

	// osmium tags-filter has no AND / AND-NOT. Parks and consulates arrive as
	// candidates; name presence and honorary_consul are decided here, the same
	// way the boundary importer drops unnamed relations after the extract.
	if (kind === "park" && !props.name?.trim()) {
		return { ok: false, reason: "missing-name", osmId };
	}
	if (kind === "consulate" && props.consulate === "honorary_consul") {
		return { ok: false, reason: "honorary-consul", osmId };
	}

	const geometry = geometrySchema.safeParse(feature.data.geometry);
	if (!geometry.success) {
		return { ok: false, reason: "not-a-place", osmId };
	}
	const place = placeFromGeometry(geometry.data);
	if (!place) return { ok: false, reason: "not-a-place", osmId };

	const name = props.name?.trim() || POI_KIND_FALLBACK[kind];
	return {
		ok: true,
		poi: {
			id: `${props["@type"]}/${osmId}`,
			name,
			kind,
			lng: place[0],
			lat: place[1],
		},
	};
}

export function poisFromGeojsonseq(text: string): CatalogPoi[] {
	const out: CatalogPoi[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		const result = parsePoiLine(line);
		if (result.ok) out.push(result.poi);
	}
	return out;
}
