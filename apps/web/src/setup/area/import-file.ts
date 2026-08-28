import { closeRing } from "@zero-lag/catalog";
import {
	EMPTY_REGION,
	type MultiPolygon,
	multiPolygonToRegion,
	type Polygon,
	type Ring,
	regionToMultiPolygon,
	unionRegions,
} from "@zero-lag/geo";

export type AreaImport =
	| {
			readonly ok: true;
			readonly name: string;
			readonly geometry: MultiPolygon;
	  }
	| { readonly ok: false; readonly error: string };

/**
 * Pull polygons out of a GeoJSON, KML or GPX file. Tracks become a ring only
 * when they already close; a hiking trace is not an area.
 */
export function parseAreaFile(fileName: string, text: string): AreaImport {
	const lower = fileName.toLowerCase();
	try {
		if (lower.endsWith(".kml") || looksLikeXml(text, "kml")) {
			return finish(displayName(fileName), ringsAsPolygons(ringsFromKml(text)));
		}
		if (lower.endsWith(".gpx") || looksLikeXml(text, "gpx")) {
			return finish(displayName(fileName), ringsAsPolygons(ringsFromGpx(text)));
		}
		const json = JSON.parse(text) as unknown;
		return finish(nameFromGeoJson(fileName, json), polygonsFromGeoJson(json));
	} catch {
		return { ok: false, error: "That file could not be read as a map." };
	}
}

/**
 * The folded playable outline as GeoJSON the file chooser can read back.
 * One MultiPolygon, not the piece recipe — Pick a file adds a single piece.
 */
export function serializeAreaFile(
	name: string,
	geometry: MultiPolygon,
): string {
	return `${JSON.stringify(
		{
			type: "Feature",
			properties: { name },
			geometry: {
				type: "MultiPolygon",
				coordinates: geometry.map((polygon) =>
					polygon.map((ring) =>
						closeRing(ring).map(([lng, lat]) => [lng, lat]),
					),
				),
			},
		},
		null,
		2,
	)}\n`;
}

export function areaFileName(name: string): string {
	const slug =
		name
			.trim()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "game-area";
	return `${slug}.geojson`;
}

/** Put a GeoJSON of the folded area on the phone, for Pick a file later. */
export function saveAreaFile(name: string, geometry: MultiPolygon): void {
	downloadTextFile(
		areaFileName(name),
		serializeAreaFile(name, geometry),
		"application/geo+json",
	);
}

function downloadTextFile(fileName: string, text: string, type: string): void {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.download = fileName;
	link.href = url;
	link.rel = "noopener";
	link.target = "_blank";
	link.addEventListener("click", (event) => {
		event.stopPropagation();
	});
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function finish(name: string, polygons: Polygon[]): AreaImport {
	if (polygons.length === 0) {
		return {
			ok: false,
			error: "No area in that file — need a polygon, not a pin.",
		};
	}
	let acc = EMPTY_REGION;
	for (const polygon of polygons) {
		const closed = polygon
			.map((ring) => closeRing(ring))
			.filter((ring) => ring.length >= 4);
		if (closed.length === 0) continue;
		acc = unionRegions(acc, multiPolygonToRegion([closed]));
	}
	const geometry = regionToMultiPolygon(acc);
	if (geometry.length === 0) {
		return { ok: false, error: "That shape has no interior." };
	}
	return { ok: true, name, geometry };
}

function ringsAsPolygons(rings: Ring[]): Polygon[] {
	return rings.map((ring) => [ring]);
}

function displayName(fileName: string): string {
	const base = fileName.split("/").pop()?.split("\\").pop() ?? fileName;
	return base.replace(/\.(geojson|json|kml|gpx)$/i, "") || "Imported area";
}

function nameFromGeoJson(fileName: string, value: unknown): string {
	const named = geoJsonName(value);
	return named ?? displayName(fileName);
}

function geoJsonName(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (record.type === "Feature") {
		const props = record.properties;
		if (props && typeof props === "object" && "name" in props) {
			const name = (props as { name: unknown }).name;
			if (typeof name === "string" && name.trim()) return name.trim();
		}
		return null;
	}
	if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
		for (const feature of record.features) {
			const named = geoJsonName(feature);
			if (named) return named;
		}
	}
	return null;
}

function looksLikeXml(text: string, root: string): boolean {
	return new RegExp(`<${root}[\\s>]`, "i").test(text.slice(0, 400));
}

function polygonsFromGeoJson(value: unknown): Polygon[] {
	if (!value || typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
		return record.features.flatMap(polygonsFromGeoJson);
	}
	if (record.type === "Feature") return polygonsFromGeoJson(record.geometry);
	if (
		record.type === "GeometryCollection" &&
		Array.isArray(record.geometries)
	) {
		return record.geometries.flatMap(polygonsFromGeoJson);
	}
	if (record.type === "Polygon" && Array.isArray(record.coordinates)) {
		const polygon = polygonFromCoords(record.coordinates);
		return polygon ? [polygon] : [];
	}
	if (record.type === "MultiPolygon" && Array.isArray(record.coordinates)) {
		const polygons: Polygon[] = [];
		for (const raw of record.coordinates) {
			const polygon = polygonFromCoords(raw);
			if (polygon) polygons.push(polygon);
		}
		return polygons;
	}
	return [];
}

function polygonFromCoords(raw: unknown): Polygon | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const outer = ringFromCoords(raw[0]);
	if (!outer) return null;
	const holes: Ring[] = [];
	for (const coords of raw.slice(1)) {
		const ring = ringFromCoords(coords);
		if (ring) holes.push(ring);
	}
	return [outer, ...holes];
}

function ringFromCoords(raw: unknown): Ring | null {
	if (!Array.isArray(raw) || raw.length < 3) return null;
	const ring: [number, number][] = [];
	for (const pair of raw) {
		if (!Array.isArray(pair) || pair.length < 2) continue;
		const lng = Number(pair[0]);
		const lat = Number(pair[1]);
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
		ring.push([lng, lat]);
	}
	return ring.length >= 3 ? ring : null;
}

function ringsFromKml(text: string): Ring[] {
	const rings: Ring[] = [];
	const block = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/gi;
	for (const match of text.matchAll(block)) {
		const ring = ringFromKmlCoords(match[1] ?? "");
		if (ring) rings.push(ring);
	}
	return rings;
}

function ringFromKmlCoords(raw: string): Ring | null {
	const ring: [number, number][] = [];
	for (const token of raw.trim().split(/[\s\n]+/)) {
		if (!token) continue;
		const [lngRaw, latRaw] = token.split(",");
		const lng = Number(lngRaw);
		const lat = Number(latRaw);
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
		ring.push([lng, lat]);
	}
	return ring.length >= 3 ? ring : null;
}

function ringsFromGpx(text: string): Ring[] {
	const rings: Ring[] = [];
	const segments = text.split(/<\/trkseg>/i);
	for (const segment of segments) {
		const ring = ringFromGpxPts(segment);
		if (ring) rings.push(ring);
	}
	if (rings.length === 0) {
		const ring = ringFromGpxPts(text);
		if (ring) rings.push(ring);
	}
	return rings;
}

function ringFromGpxPts(text: string): Ring | null {
	const ring: [number, number][] = [];
	const pt = /<(?:trkpt|rtept)\b([^>]*)>/gi;
	for (const match of text.matchAll(pt)) {
		const attrs = match[1] ?? "";
		const lat = Number(/lat="([^"]+)"/i.exec(attrs)?.[1]);
		const lng = Number(/lon="([^"]+)"/i.exec(attrs)?.[1]);
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
		ring.push([lng, lat]);
	}
	if (ring.length < 3) return null;
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (!first || !last) return null;
	const closed =
		Math.abs(first[0] - last[0]) < 1e-5 && Math.abs(first[1] - last[1]) < 1e-5;
	return closed ? ring : null;
}
