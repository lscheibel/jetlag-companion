import type {
	AdminBoundary,
	AreaPack,
	TransitLine,
	TransitStop,
} from "@zero-lag/area-packs";
import { distanceMeters, type LngLat, multiPolygonBBox } from "@zero-lag/geo";

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
	  };

export function formatDistance(meters: number): string {
	if (meters < 1_000) return `${Math.round(meters)} m`;
	if (meters <= 100_000) return `${(meters / 1_000).toFixed(2)} km`;
	return `${Math.round(meters / 1_000)} km`;
}

export function pathSegments(points: readonly LngLat[]): readonly number[] {
	return points.slice(1).map((point, index) => {
		const previous = points[index];
		return previous ? distanceMeters(previous, point) : 0;
	});
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
	if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

	const swapped = Math.abs(first) > 90;
	const lat = swapped ? second : first;
	const lng = swapped ? first : second;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { point: [lng, lat], swapped };
}

type NamedSearchResult =
	| {
			readonly kind: "stop";
			readonly stop: TransitStop;
			readonly distance: number;
	  }
	| {
			readonly kind: "line";
			readonly line: TransitLine;
			readonly distance: number;
	  }
	| {
			readonly kind: "boundary";
			readonly boundary: AdminBoundary;
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

function centerOfBounds(
	bounds: readonly [number, number, number, number],
): LngLat {
	return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export function searchAreaPack(
	pack: AreaPack,
	input: string,
	origin: LngLat,
): readonly SearchResult[] {
	const coordinate = parseCoordinates(input);
	if (coordinate) return [{ kind: "coordinate", parsed: coordinate }];

	const queryForms = searchForms(input);
	if (queryForms[0] === "") return [];
	const stopById = new Map(pack.stops.map((stop) => [stop.id, stop]));
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

	for (const stop of pack.stops) {
		const rank = rankName(stop.name);
		if (rank === null) continue;
		matches.push({
			kind: "stop",
			stop,
			distance: distanceMeters(origin, stop.position),
			rank,
			name: stop.name,
		});
	}
	for (const line of pack.lines) {
		const rank = rankName(line.name);
		if (rank === null) continue;
		const stops = line.stopIds
			.map((id) => stopById.get(id))
			.filter((stop): stop is TransitStop => stop !== undefined);
		const distance = Math.min(
			...stops.map((stop) => distanceMeters(origin, stop.position)),
		);
		matches.push({ kind: "line", line, distance, rank, name: line.name });
	}
	for (const boundary of pack.boundaries) {
		const rank = rankName(boundary.name);
		if (rank === null) continue;
		const bounds = multiPolygonBBox(boundary.polygons);
		if (!bounds) continue;
		const center = centerOfBounds(bounds);
		matches.push({
			kind: "boundary",
			boundary,
			distance: distanceMeters(origin, center),
			rank,
			name: boundary.name,
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
