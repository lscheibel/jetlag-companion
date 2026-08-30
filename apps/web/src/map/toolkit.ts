import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { type ConstraintGeometry, radiusCenters } from "@zero-lag/rules";
import type { ConstraintOrigin } from "@zero-lag/schema";
import { asPoiTypeId, type PoiTypeId } from "./poi-type";

/**
 * What place search runs over: the stops the game carries. m4-spec §5.
 *
 * A structural type rather than an import of the Zero row, so the search is
 * testable against a literal and does not need a database to exercise.
 */
export interface SearchableStop {
	readonly stopId: string;
	readonly name: string;
	readonly lng: number;
	readonly lat: number;
	readonly modeIds: readonly string[];
	readonly lines: readonly { readonly name: string; readonly modeId: string }[];
	/** Outside the area is normal and searchable — m4-spec §5. */
	readonly insideArea: boolean;
}

export function stopPosition(stop: SearchableStop): LngLat {
	return [stop.lng, stop.lat];
}

/** Finger slop around a 4 px circle so a stop is actually tappable. */
export const STOP_TAP_PX = 24;

/** The pin marker is a 44 px column, not a 4 px dot. */
export const PIN_TAP_PX = 44;

export function nearestHitPx<T>(
	items: readonly T[],
	screen: { x: number; y: number },
	locate: (item: T) => LngLat,
	project: (lngLat: LngLat) => { x: number; y: number },
	maxPx: number,
): { item: T; dist: number } | null {
	let best: T | null = null;
	let bestDist = maxPx;
	for (const item of items) {
		const point = project(locate(item));
		const dist = Math.hypot(point.x - screen.x, point.y - screen.y);
		if (dist <= bestDist) {
			bestDist = dist;
			best = item;
		}
	}
	return best ? { item: best, dist: bestDist } : null;
}

export function nearestAtPx<T>(
	items: readonly T[],
	screen: { x: number; y: number },
	locate: (item: T) => LngLat,
	project: (lngLat: LngLat) => { x: number; y: number },
	maxPx: number,
): T | null {
	return nearestHitPx(items, screen, locate, project, maxPx)?.item ?? null;
}

export function nearestStopPx(
	stops: readonly SearchableStop[],
	screen: { x: number; y: number },
	project: (lngLat: LngLat) => { x: number; y: number },
	maxPx: number = STOP_TAP_PX,
): SearchableStop | null {
	return nearestAtPx(
		stops,
		screen,
		(stop) => [stop.lng, stop.lat],
		project,
		maxPx,
	);
}

export type Measure =
	| { readonly kind: "path"; readonly points: readonly LngLat[] }
	| {
			readonly kind: "radius";
			readonly center: LngLat | null;
			readonly radiusMeters: number;
	  };

export type MapTool =
	| { readonly kind: "none" }
	| { readonly kind: "measure"; readonly measure: Measure }
	| { readonly kind: "placingPin" }
	| { readonly kind: "editingPin"; readonly pinId: string }
	| {
			readonly kind: "placingZone";
			readonly center: LngLat | null;
			readonly radiusMeters: number;
			readonly stopId: string | null;
	  }
	| {
			readonly kind: "drawingRadiusConstraint";
			readonly centers: readonly LngLat[];
			readonly radiusMeters: number;
			readonly poiKind: PoiTypeId | null;
			readonly pickingKind: boolean;
	  }
	| {
			readonly kind: "drawingPolygonConstraint";
			readonly ring: readonly LngLat[];
	  }
	| {
			readonly kind: "drawingSplitConstraint";
			readonly from: LngLat | null;
			readonly to: LngLat | null;
			readonly focus: "from" | "to";
	  }
	| {
			readonly kind: "pickingBoundaryConstraint";
			readonly levels: readonly (9 | 10)[];
			readonly selectedId: string | null;
	  }
	| {
			readonly kind: "pickingClosestPoiConstraint";
			readonly filterKind: PoiTypeId | null;
			readonly selectedId: string | null;
			readonly radiusMeters: number | null;
	  }
	| { readonly kind: "listingConstraints" }
	| { readonly kind: "searching" };

export type RadiusConstraintTool = Extract<
	MapTool,
	{ kind: "drawingRadiusConstraint" }
>;

export function radiusConstraintReady(centers: readonly LngLat[]): boolean {
	return centers.length > 0;
}

export const BOUNDARY_CONSTRAINT_LEVELS = [9, 10] as const;

export function toggleBoundaryLevel(
	levels: readonly (9 | 10)[],
	level: 9 | 10,
): readonly (9 | 10)[] {
	return levels.includes(level)
		? levels.filter((item) => item !== level)
		: [...levels, level];
}

export type BoundaryListItem = {
	readonly id: string;
	readonly name: string;
	readonly adminLevel: 4 | 9 | 10;
	readonly label: string;
};

export type ConstraintListItem = {
	readonly id: string;
	readonly source: "answer" | "manual";
	readonly mode: "include" | "exclude";
	readonly geometry: ConstraintGeometry;
	/** Null on answer-derived rows, and on rows written before edit existed. */
	readonly origin: ConstraintOrigin | null;
	readonly enabled: boolean;
	readonly name: string | null;
};

/** What the list calls a shape. Four geometry kinds, three words for them. */
export function constraintKindLabel(geometry: ConstraintGeometry): string {
	if (geometry.kind === "radius") return "Circle";
	if (geometry.kind === "halfPlane") return "Split";
	return "Area";
}

/**
 * Reopening a cut: the tool that drew it, restored to the state it was
 * committed in, plus where the cut/keep pair stood.
 */
export type ConstraintEdit = {
	readonly tool: MapTool;
	readonly cut: boolean;
};

/**
 * Null when there is no tool to go back to — an answer-derived row, or a
 * pre-`origin` polygon, whose author (drawn, Bezirk, nearest cell) the
 * geometry alone cannot name.
 */
export function constraintEditTool(
	row: ConstraintListItem,
): ConstraintEdit | null {
	if (row.source !== "manual") return null;
	// A split has no include/exclude; its pair picks which side falls away.
	const cut =
		row.geometry.kind === "halfPlane"
			? row.geometry.nearer === "b"
			: row.mode === "exclude";
	const origin = row.origin;
	if (origin) {
		switch (origin.tool) {
			case "drawingRadiusConstraint":
				return {
					cut,
					tool: {
						kind: "drawingRadiusConstraint",
						centers: origin.centers,
						radiusMeters: origin.radiusMeters,
						poiKind: asPoiTypeId(origin.poiKind),
						pickingKind: false,
					},
				};
			case "drawingPolygonConstraint":
				return {
					cut,
					tool: { kind: "drawingPolygonConstraint", ring: origin.ring },
				};
			case "drawingSplitConstraint":
				return {
					cut,
					tool: {
						kind: "drawingSplitConstraint",
						from: origin.from,
						to: origin.to,
						focus: "from",
					},
				};
			case "pickingBoundaryConstraint":
				return {
					cut,
					tool: {
						kind: "pickingBoundaryConstraint",
						levels: BOUNDARY_CONSTRAINT_LEVELS,
						selectedId: origin.boundaryId,
					},
				};
			case "pickingClosestPoiConstraint":
				return {
					cut,
					tool: {
						kind: "pickingClosestPoiConstraint",
						filterKind: asPoiTypeId(origin.filterKind),
						selectedId: origin.poiId,
						radiusMeters: origin.radiusMeters,
					},
				};
		}
	}
	/**
	 * Older rows, and the suspect-zone macro, carry no origin. A circle and a
	 * split are still exactly what they look like; a polygon is not.
	 */
	if (row.geometry.kind === "radius") {
		const centers = radiusCenters(row.geometry);
		if (centers.length === 0) return null;
		return {
			cut,
			tool: {
				kind: "drawingRadiusConstraint",
				centers,
				radiusMeters: row.geometry.radius,
				poiKind: null,
				pickingKind: false,
			},
		};
	}
	if (row.geometry.kind === "halfPlane") {
		return {
			cut,
			tool: {
				kind: "drawingSplitConstraint",
				from: row.geometry.a,
				to: row.geometry.b,
				focus: "from",
			},
		};
	}
	return null;
}

export function formatDistance(meters: number): string {
	if (meters < 1_000) return `${Math.round(meters)} m`;
	if (meters <= 100_000) return `${(meters / 1_000).toFixed(2)} km`;
	return `${Math.round(meters / 1_000)} km`;
}

/** Null when there is no GPS fix to measure from. */
export function distanceFromYou(
	from: LngLat | null,
	lng: number,
	lat: number,
): string | null {
	if (!from) return null;
	return formatDistance(distanceMeters(from, [lng, lat]));
}

export function pathSegments(points: readonly LngLat[]): readonly number[] {
	return points.slice(1).map((point, index) => {
		const previous = points[index];
		return previous ? distanceMeters(previous, point) : 0;
	});
}

export function sameLngLat(a: LngLat, b: LngLat): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

/**
 * A "to me" vertex is only useful when the path already has somewhere to
 * measure from, and the last vertex is not already the GPS fix — a
 * zero-length last segment is a tap that did nothing.
 */
export function canMeasureToYou(
	points: readonly LngLat[],
	you: LngLat | null,
): boolean {
	if (you === null || points.length === 0) return false;
	const last = points[points.length - 1];
	return last !== undefined && !sameLngLat(last, you);
}

export function formatCoordinates(point: LngLat): string {
	return `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`;
}

export type ParsedCoordinates = {
	readonly point: LngLat;
	readonly swapped: boolean;
};

export function parseCoordinates(input: string): ParsedCoordinates | null {
	const match = input
		.trim()
		.match(
			/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/,
		);
	if (!match) return null;
	const first = Number(match[1]);
	const second = Number(match[2]);
	return pairAsPoint(first, second);
}

/**
 * Clipboard paste: comma/space/semicolon pairs, JSON arrays, and objects
 * keyed with lat/lng, lon, latitude, longitude, or GeoJSON `coordinates`.
 */
export function parsePastedCoordinates(
	input: string,
): ParsedCoordinates | null {
	const text = input.trim();
	if (!text) return null;

	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			const fromJson = pointFromUnknown(JSON.parse(text) as unknown);
			if (fromJson) return fromJson;
		} catch {
			// Unquoted keys still go through the named-pair scan below.
		}
	}

	const named = namedPair(text);
	if (named) return named;

	const latLngCall = text.match(
		/latlng\s*\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/i,
	);
	if (latLngCall) {
		return pairAsPoint(Number(latLngCall[1]), Number(latLngCall[2]));
	}

	const normalised = text
		.replace(/[°º]/g, "")
		.replace(/\s*[NSEW]\b/gi, "")
		.replace(/[;|/\t()]/g, " ");
	return parseCoordinates(normalised.replace(/\s+/g, " ").trim());
}

function pairAsPoint(first: number, second: number): ParsedCoordinates | null {
	if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
	const swapped = Math.abs(first) > 90;
	const lat = swapped ? second : first;
	const lng = swapped ? first : second;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { point: [lng, lat], swapped };
}

function namedNumber(
	record: Record<string, unknown>,
	keys: readonly string[],
): number | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function pointFromUnknown(value: unknown): ParsedCoordinates | null {
	if (Array.isArray(value)) {
		if (value.length < 2) return null;
		const first = Number(value[0]);
		const second = Number(value[1]);
		return pairAsPoint(first, second);
	}
	if (value === null || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (Array.isArray(record.coordinates)) {
		const first = Number(record.coordinates[0]);
		const second = Number(record.coordinates[1]);
		if (Number.isFinite(first) && Number.isFinite(second)) {
			if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
				return { point: [first, second], swapped: true };
			}
			return pairAsPoint(first, second);
		}
	}
	if ("geometry" in record) return pointFromUnknown(record.geometry);
	if ("location" in record) return pointFromUnknown(record.location);

	const lat = namedNumber(record, ["lat", "latitude", "y"]);
	const lng = namedNumber(record, ["lng", "lon", "long", "longitude", "x"]);
	if (lat === null || lng === null) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { point: [lng, lat], swapped: false };
}

function namedPair(text: string): ParsedCoordinates | null {
	const lat = text.match(
		/\b(?:lat(?:itude)?)\s*[:=]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i,
	);
	const lng = text.match(
		/\b(?:lng|lon|long|longitude)\s*[:=]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i,
	);
	if (!lat || !lng) return null;
	const latN = Number(lat[1]);
	const lngN = Number(lng[1]);
	if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
	if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return null;
	return { point: [lngN, latN], swapped: false };
}

/**
 * Lines and administrative boundaries were searchable when the area pack
 * carried them. M4 carries neither: a game's stops come from the catalog with
 * their modes and nothing else, line-level data returns with the toggles in
 * M18, and boundaries are M6's question data. m4-spec §2.
 */
type NamedSearchResult = {
	readonly kind: "stop";
	readonly stop: SearchableStop;
	readonly distance: number;
};

export type SearchResult =
	| NamedSearchResult
	| { readonly kind: "coordinate"; readonly parsed: ParsedCoordinates };

const ALIASES = new Map([
	["hbf", "hauptbahnhof"],
	["str", "strasse"],
]);

function fold(value: string): string {
	return value
		.toLocaleLowerCase("de")
		.replaceAll("ä", "ae")
		.replaceAll("ö", "oe")
		.replaceAll("ü", "ue")
		.replaceAll("ß", "ss")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim();
}

function searchForms(value: string): readonly string[] {
	const folded = fold(value);
	const words = folded.split(/\s+/).filter(Boolean);
	const expanded = words.map((word) => ALIASES.get(word) ?? word).join(" ");
	const plain = value
		.toLocaleLowerCase("de")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replaceAll("ß", "ss")
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim();
	return [...new Set([folded, expanded, plain])];
}

export function searchStops(
	stops: readonly SearchableStop[],
	input: string,
	origin: LngLat,
): readonly SearchResult[] {
	const coordinate = parseCoordinates(input);
	if (coordinate) return [{ kind: "coordinate", parsed: coordinate }];

	const queryForms = searchForms(input);
	if (queryForms[0] === "") return [];
	const matches: Array<NamedSearchResult & { rank: number; name: string }> = [];

	const rankName = (name: string): number | null => {
		const names = searchForms(name);
		if (
			queryForms.some((query) =>
				names.some((candidate) => candidate.startsWith(query)),
			)
		) {
			return 0;
		}
		if (
			queryForms.some((query) =>
				names.some((candidate) => candidate.includes(query)),
			)
		) {
			return 1;
		}
		return null;
	};

	for (const stop of stops) {
		const rank = rankName(stop.name);
		if (rank === null) continue;
		matches.push({
			kind: "stop",
			stop,
			distance: distanceMeters(origin, stopPosition(stop)),
			rank,
			name: stop.name,
		});
	}

	return matches
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				a.distance - b.distance ||
				a.name.localeCompare(b.name, "de"),
		)
		.map(({ rank: _rank, name: _name, ...result }) => result);
}
