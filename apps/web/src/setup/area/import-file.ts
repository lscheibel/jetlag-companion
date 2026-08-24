import { closeRing } from "@zero-lag/catalog";
import {
	type MultiPolygon,
	multiPolygonToRegion,
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
	const name = displayName(fileName);
	const lower = fileName.toLowerCase();
	try {
		if (lower.endsWith(".kml") || looksLikeXml(text, "kml")) {
			return finish(name, ringsFromKml(text));
		}
		if (lower.endsWith(".gpx") || looksLikeXml(text, "gpx")) {
			return finish(name, ringsFromGpx(text));
		}
		return finish(name, ringsFromGeoJson(JSON.parse(text) as unknown));
	} catch {
		return { ok: false, error: "That file could not be read as a map." };
	}
}

function finish(name: string, rings: Ring[]): AreaImport {
	if (rings.length === 0) {
		return {
			ok: false,
			error: "No area in that file — need a polygon, not a pin.",
		};
	}
	let acc = multiPolygonToRegion([[closeRing(rings[0] as Ring)]]);
	for (const ring of rings.slice(1)) {
		acc = unionRegions(acc, multiPolygonToRegion([[closeRing(ring)]]));
	}
	const geometry = regionToMultiPolygon(acc);
	if (geometry.length === 0) {
		return { ok: false, error: "That shape has no interior." };
	}
	return { ok: true, name, geometry };
}

function displayName(fileName: string): string {
	const base = fileName.split("/").pop()?.split("\\").pop() ?? fileName;
	return base.replace(/\.(geojson|json|kml|gpx)$/i, "") || "Imported area";
}

function looksLikeXml(text: string, root: string): boolean {
	return new RegExp(`<${root}[\\s>]`, "i").test(text.slice(0, 400));
}

function ringsFromGeoJson(value: unknown): Ring[] {
	if (!value || typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
		return record.features.flatMap(ringsFromGeoJson);
	}
	if (record.type === "Feature") return ringsFromGeoJson(record.geometry);
	if (
		record.type === "GeometryCollection" &&
		Array.isArray(record.geometries)
	) {
		return record.geometries.flatMap(ringsFromGeoJson);
	}
	if (record.type === "Polygon" && Array.isArray(record.coordinates)) {
		const outer = ringFromCoords(record.coordinates[0]);
		return outer ? [outer] : [];
	}
	if (record.type === "MultiPolygon" && Array.isArray(record.coordinates)) {
		const rings: Ring[] = [];
		for (const polygon of record.coordinates) {
			if (!Array.isArray(polygon)) continue;
			const outer = ringFromCoords(polygon[0]);
			if (outer) rings.push(outer);
		}
		return rings;
	}
	return [];
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
