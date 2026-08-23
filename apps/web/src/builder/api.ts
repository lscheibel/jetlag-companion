import type { LngLat } from "@zero-lag/geo";
import type { ScalePreset, StoredMultiPolygon } from "@zero-lag/schema";
import { serverUrl } from "../dev-origin";
import type { Session } from "../session";

/**
 * Templates, applying and the catalog read, all plain HTTP. m4-spec §7.
 *
 * Zero's query context is a game and a template belongs to no game — and the
 * catalog is not in Zero's database at all.
 */

export interface CatalogStopRow {
	readonly id: string;
	readonly name: string;
	readonly lng: number;
	readonly lat: number;
	readonly modeIds: readonly string[];
	readonly lines: readonly {
		readonly name: string;
		readonly modeId: string;
	}[];
}

export interface CatalogView {
	readonly version: string;
	readonly total: number;
	readonly truncated: boolean;
	readonly stops: readonly CatalogStopRow[];
}

export interface TemplateRow {
	readonly id: string;
	readonly code: string;
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly selection: {
		readonly kind: "drawn";
		readonly polygon: StoredMultiPolygon;
	};
	readonly hidingRadiusMeters: number;
	readonly validHidingArea: StoredMultiPolygon;
	readonly catalogVersion: string;
	readonly contentHash: string;
}

export interface AppliedMap {
	readonly mapConfigId: string;
	readonly contentHash: string;
	readonly stopCount: number;
	readonly catalogVersion: string;
	/**
	 * The pinned catalog was superseded and the current one was used instead.
	 * The polygon is unaffected either way — this is worth saying, not worth
	 * failing over. m4-spec §7.
	 */
	readonly catalogVersionChanged: boolean;
}

export interface MapDraftBody {
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly ring: readonly LngLat[];
	readonly hidingRadiusMeters: number;
}

async function call<T>(
	path: string,
	session: Session,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(`${serverUrl()}/api${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.token}`,
			...init?.headers,
		},
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({ error: "unknown" }));
		throw new Error(body.error ?? `request failed: ${response.status}`);
	}
	return response.json() as Promise<T>;
}

export function fetchCatalogStops(
	session: Session,
	bbox: readonly [number, number, number, number],
): Promise<CatalogView> {
	return call<CatalogView>(`/catalog/stops?bbox=${bbox.join(",")}`, session);
}

export interface CatalogBoundaryRow {
	readonly id: string;
	readonly name: string;
	readonly adminLevel: 9 | 10;
	readonly label: string;
	readonly polygons: StoredMultiPolygon;
}

export interface CatalogBoundariesView {
	readonly total: number;
	readonly truncated: boolean;
	readonly boundaries: readonly CatalogBoundaryRow[];
}

export function fetchCatalogBoundaries(
	session: Session,
	bbox: readonly [number, number, number, number],
	adminLevel: 9 | 10,
): Promise<CatalogBoundariesView> {
	return call<CatalogBoundariesView>(
		`/catalog/boundaries?bbox=${bbox.join(",")}&adminLevel=${adminLevel}`,
		session,
	);
}

export function saveTemplate(
	session: Session,
	draft: MapDraftBody,
): Promise<{ id: string; code: string; contentHash: string }> {
	return call("/maps", session, {
		method: "POST",
		body: JSON.stringify(draft),
	});
}

export function fetchTemplate(
	session: Session,
	code: string,
): Promise<TemplateRow> {
	return call<TemplateRow>(`/maps/${code.toUpperCase()}`, session);
}

/**
 * Applying waits. m3-spec §10's rule: a write that has to be true somewhere
 * else before it means anything does not apply optimistically, and a board
 * everybody plays on is the case that rule was written for.
 */
export function applyMap(
	session: Session,
	body: MapDraftBody | { templateCode: string },
): Promise<AppliedMap> {
	return call<AppliedMap>(`/games/${session.gameId}/map`, session, {
		method: "POST",
		body: JSON.stringify(body),
	});
}
