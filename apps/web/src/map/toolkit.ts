import { type BBox, distanceMeters, type LngLat } from "@zero-lag/geo";
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

/**
 * Somewhere a tap can land on rather than beside, with the slop its marker
 * earns — a 4 px station dot and a 44 px pin column are not the same target.
 */
export type SnapTarget = {
	readonly point: LngLat;
	readonly maxPx: number;
};

/**
 * The drawn thing nearest a tap, or null when the tap landed on open map.
 * Each target carries its own radius, so this is a per-target comparison
 * rather than `nearestHitPx`'s single cutoff.
 */
export function snapToTarget(
	targets: readonly SnapTarget[],
	screen: { x: number; y: number },
	project: (lngLat: LngLat) => { x: number; y: number },
): LngLat | null {
	let best: SnapTarget | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const target of targets) {
		const at = project(target.point);
		const dist = Math.hypot(at.x - screen.x, at.y - screen.y);
		if (dist <= target.maxPx && dist < bestDist) {
			bestDist = dist;
			best = target;
		}
	}
	return best ? best.point : null;
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

/**
 * Where the game is, when the caller knows: the extent used to break a tie
 * between the two ways a pair of small numbers can be read. Optional
 * everywhere, because a field outside a game still has to parse a coordinate.
 */
export type OrderHint = BBox | null;

export function parseCoordinates(
	input: string,
	near: OrderHint = null,
): ParsedCoordinates | null {
	const match = input
		.trim()
		.match(
			/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,\s*|\s+)([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/,
		);
	if (!match) return null;
	const first = Number(match[1]);
	const second = Number(match[2]);
	return pairAsPoint(first, second, near);
}

/**
 * Clipboard paste: comma/space/semicolon pairs, JSON arrays, and objects
 * keyed with lat/lng, lon, latitude, longitude, or GeoJSON `coordinates` —
 * and, once all of those have declined, a pair found loose in prose.
 *
 * The order matters. Every reading above the scan says which number is which,
 * either by naming it or by being a format with an order of its own; the scan
 * only says two numbers were adjacent. So the scan runs last and never
 * overrules a parser that had something firmer to go on.
 */
export function parsePastedCoordinates(
	input: string,
	near: OrderHint = null,
): ParsedCoordinates | null {
	const text = input.trim();
	if (!text) return null;

	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			const fromJson = pointFromUnknown(JSON.parse(text) as unknown, near);
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
		return pairAsPoint(Number(latLngCall[1]), Number(latLngCall[2]), near);
	}

	const link = linkPair(text);
	if (link) return link;

	const normalised = text
		.replace(/[°º]/g, "")
		.replace(/\s*[NSEW]\b/gi, "")
		.replace(/[;|/\t()]/g, " ");
	const plain = parseCoordinates(normalised.replace(/\s+/g, " ").trim(), near);
	if (plain) return plain;

	const decimalComma = commaDecimalPair(text, near);
	if (decimalComma) return decimalComma;

	return scanForPair(text, near);
}

/** A number in a URL: no exponent, no thousands separator, either sign. */
const URL_NUMBER = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/**
 * The map links a player actually shares, each of which states its order.
 *
 * Every one of these is latitude first — it is the convention the whole
 * consumer-mapping world settled on, and the two places that disagree
 * (GeoJSON, MapLibre) are formats rather than links. So a link is read as
 * written and never handed to the area for a second opinion: a link that says
 * `@13.4,52.5` means the Gulf of Aden, and quietly relocating it to Berlin
 * would be inventing a correction the player never asked for.
 */
const LINK_PATTERNS: readonly RegExp[] = [
	// Google Maps viewport: /@52.52,13.405,15z — and the same shape without it.
	new RegExp(String.raw`@${URL_NUMBER},${URL_NUMBER}(?:,[\d.]+[a-z])?`, "i"),
	// Google's place detail, which survives the tail of a long share link.
	new RegExp(`!3d${URL_NUMBER}!4d${URL_NUMBER}`, "i"),
	// Query points: Google, Apple, Bing. Bing spells its separator `~`.
	new RegExp(
		`[?&#](?:q|ll|sll|cp|center|destination|daddr|saddr)=${URL_NUMBER}[,~]${URL_NUMBER}`,
		"i",
	),
	// OpenStreetMap: #map=15/52.52/13.405.
	new RegExp(String.raw`#map=[\d.]+/${URL_NUMBER}/${URL_NUMBER}`, "i"),
	// RFC 5870.
	new RegExp(String.raw`\bgeo:${URL_NUMBER},${URL_NUMBER}`, "i"),
];

/**
 * Null for a link that carries no coordinate at all — a `maps.app.goo.gl`
 * shortener holds nothing but an id, and resolving one means a network round
 * trip to Google from a phone that may well be offline. A player who pasted one
 * gets the same "nothing in that looks like a point" as before.
 */
function linkPair(text: string): ParsedCoordinates | null {
	for (const pattern of LINK_PATTERNS) {
		const match = text.match(pattern);
		if (!match) continue;
		const found = declaredPoint(Number(match[1]), Number(match[2]));
		if (found) return found;
	}
	return null;
}

/**
 * A pair whose order the source already settled: named keys, or a link format
 * with a documented one. Range-checked, and never reordered.
 */
function declaredPoint(lat: number, lng: number): ParsedCoordinates | null {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { point: [lng, lat], swapped: false };
}

/**
 * A pair written the German way — `52,3448, 13,44355` — as the whole of the
 * text.
 *
 * Anchored, and only ever tried once the dot reading has failed, because the
 * two jobs the comma is doing here can only be told apart by there being
 * exactly two numbers in the string. `52,52,13,405` has four readings and gets
 * none of them.
 */
function commaDecimalPair(
	text: string,
	near: OrderHint,
): ParsedCoordinates | null {
	const match = text.match(
		/^([+-]?\d{1,3}),(\d+)(?:,\s+|;\s*|\s+)([+-]?\d{1,3}),(\d+)$/,
	);
	if (!match) return null;
	return pairAsPoint(
		Number(`${match[1]}.${match[2]}`),
		Number(`${match[3]}.${match[4]}`),
		near,
	);
}

/**
 * The fewest fraction digits a number needs before it is worth reading as half
 * of a coordinate.
 *
 * This is the whole of the scan's defence against the rest of a message. A Jet
 * Lag question is full of numbers — `1100m`, `500m`, `1km`, `15z` — and none of
 * them carry three decimal places, while a coordinate that reached a clipboard
 * came out of a map app and carries five or six. The cost is that a hand-typed
 * `52.52, 13.405` is only found when it is the whole of the text, which it
 * already was.
 */
const SCAN_FRACTION_DIGITS = 3;

/**
 * Two numbers, adjacent, somewhere in text that is mostly about something else.
 *
 * Either decimal separator, and the separator between the halves is required
 * rather than optional so that a run of glued digits cannot be cut in half at
 * a plausible-looking point. `52,3448, 13,44355` comes apart the only way it
 * can: the greedy fraction takes the decimal comma, and the comma left over is
 * the one between the halves.
 */
const EMBEDDED_PAIR = new RegExp(
	String.raw`(?<![\d.,])([+-]?\d{1,3})([.,])(\d{${SCAN_FRACTION_DIGITS},})(?:\s*[,;]\s*|\s+)([+-]?\d{1,3})([.,])(\d{${SCAN_FRACTION_DIGITS},})(?![\d.,]*\d)`,
	"g",
);

/**
 * Best effort, and last: the first pair in the text that reads as a place.
 *
 * A message can carry more than one, and nothing here can tell which one the
 * player meant — the field is editable and the map shows where it landed, so
 * the first is a guess the player can see and correct rather than one they
 * have to trust.
 *
 * The two halves must punctuate themselves the same way, which is the only
 * defence there is against a thousands separator. `1,532` and a comma decimal
 * are the same six characters, and `within 1,532, 13.4498` reads as a point in
 * the Gulf of Guinea unless something rules it out; a pair that came off a map
 * app is written one way throughout, and a distance followed by a coordinate
 * almost never is.
 */
function scanForPair(text: string, near: OrderHint): ParsedCoordinates | null {
	for (const match of text.matchAll(EMBEDDED_PAIR)) {
		if (match[2] !== match[5]) continue;
		const found = pairAsPoint(
			Number(`${match[1]}.${match[3]}`),
			Number(`${match[4]}.${match[6]}`),
			near,
		);
		if (found) return found;
	}
	return null;
}

/**
 * How far outside the game area a coordinate can still be said to belong to it.
 *
 * Deliberately far past anything a game covers. The question this answers is
 * not "is this point in play" — it is "of these two readings, did one of them
 * land in a different part of the world", and a threshold tight enough to be a
 * containment test would start throwing away real points a suburb outside the
 * boundary.
 */
const NEAR_AREA_METERS = 100_000;

function bboxDistanceMeters(box: BBox, point: LngLat): number {
	const [minLng, minLat, maxLng, maxLat] = box;
	const lng = Math.min(Math.max(point[0], minLng), maxLng);
	const lat = Math.min(Math.max(point[1], minLat), maxLat);
	return distanceMeters(point, [lng, lat]);
}

/**
 * Which number is the latitude.
 *
 * Above 90 there is nothing to decide — only one reading is a place at all.
 * Below it both are, and the tie is broken by the game area when there is one:
 * a pair that reads as Kazakhstan one way round and as this city the other way
 * is not really ambiguous, whatever the arithmetic says. With no area, or with
 * both readings equally plausible, lat-first stands as the default it always
 * was.
 */
function pairAsPoint(
	first: number,
	second: number,
	near: OrderHint = null,
): ParsedCoordinates | null {
	if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
	const latFirst: LngLat = [second, first];
	const lngFirst: LngLat = [first, second];
	const latFirstReads = Math.abs(first) <= 90 && Math.abs(second) <= 180;
	const lngFirstReads = Math.abs(second) <= 90 && Math.abs(first) <= 180;

	if (!latFirstReads) {
		return lngFirstReads ? { point: lngFirst, swapped: true } : null;
	}
	if (!lngFirstReads) return { point: latFirst, swapped: false };

	if (near) {
		const latFirstNear = bboxDistanceMeters(near, latFirst) <= NEAR_AREA_METERS;
		const lngFirstNear = bboxDistanceMeters(near, lngFirst) <= NEAR_AREA_METERS;
		if (latFirstNear !== lngFirstNear) {
			return lngFirstNear
				? { point: lngFirst, swapped: true }
				: { point: latFirst, swapped: false };
		}
	}

	return { point: latFirst, swapped: false };
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

function pointFromUnknown(
	value: unknown,
	near: OrderHint = null,
): ParsedCoordinates | null {
	if (Array.isArray(value)) {
		if (value.length < 2) return null;
		const first = Number(value[0]);
		const second = Number(value[1]);
		return pairAsPoint(first, second, near);
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
			return pairAsPoint(first, second, near);
		}
	}
	if ("geometry" in record) return pointFromUnknown(record.geometry, near);
	if ("location" in record) return pointFromUnknown(record.location, near);

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
	return declaredPoint(Number(lat[1]), Number(lng[1]));
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
