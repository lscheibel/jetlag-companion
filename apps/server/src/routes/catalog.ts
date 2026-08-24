import type { CatalogBoundary } from "@zero-lag/catalog";
import type { BBox } from "@zero-lag/geo";
import { Hono } from "hono";
import { z } from "zod";
import { contextFromRequest } from "../auth";
import {
	boundariesInView,
	boundariesNamed,
	boundaryCountAtLevels,
} from "../boundaries";
import { catalogVersion, stopsInView } from "../catalog";

/**
 * The builder's one catalog read. m4-spec §7, §9.
 *
 * HTTP rather than Zero for the strongest version of the reason templates are:
 * the catalog is not in Zero's database at all. A game token is still required
 * — this is not an open data endpoint, and everyone who needs it has one.
 */

const bboxSchema = z
	.string()
	.transform((raw) => raw.split(",").map(Number))
	.refine(
		(values): values is [number, number, number, number] =>
			values.length === 4 && values.every(Number.isFinite),
		{ message: "bbox must be minLng,minLat,maxLng,maxLat" },
	);

/**
 * The builder debounces on map idle, but a client that asks for the whole
 * country still gets an answer it can render rather than 251,741 rows.
 */
const MAX_STOPS = 2_000;
const MAX_BOUNDARIES = 200;

const adminLevelSchema = z
	.string()
	.transform((raw) => Number(raw))
	.refine(
		(value): value is 4 | 9 | 10 => value === 4 || value === 9 || value === 10,
		{ message: "adminLevel must be 4, 9 or 10" },
	);

export const catalog = new Hono();

catalog.get("/stops", async (c) => {
	const ctx = await contextFromRequest(c.req.raw);
	if (!ctx) return c.json({ error: "unauthenticated" }, 401);

	const parsed = bboxSchema.safeParse(c.req.query("bbox") ?? "");
	if (!parsed.success) return c.json({ error: "invalid_bbox" }, 400);

	const bbox = parsed.data as BBox;
	const found = stopsInView(bbox);

	return c.json({
		version: catalogVersion(),
		total: found.length,
		truncated: found.length > MAX_STOPS,
		stops: found.slice(0, MAX_STOPS),
	});
});

const levelsSchema = z
	.string()
	.transform((raw) =>
		raw
			.split(",")
			.map((part) => Number(part.trim()))
			.filter((value) => value === 4 || value === 9 || value === 10),
	)
	.refine((values): values is (4 | 9 | 10)[] => values.length > 0, {
		message: "levels must name 4, 9 or 10",
	});

function compactBoundary(row: CatalogBoundary) {
	return {
		id: row.id,
		name: row.name,
		adminLevel: row.adminLevel,
		label: row.label,
		polygons: row.polygons,
	};
}

catalog.get("/boundaries", async (c) => {
	const ctx = await contextFromRequest(c.req.raw);
	if (!ctx) return c.json({ error: "unauthenticated" }, 401);

	const levelsRaw = c.req.query("levels");
	if (levelsRaw !== undefined && levelsRaw !== "") {
		const levels = levelsSchema.safeParse(levelsRaw);
		if (!levels.success) return c.json({ error: "invalid_admin_level" }, 400);

		const bboxQuery = c.req.query("bbox");
		let bbox: BBox | null = null;
		if (bboxQuery !== undefined && bboxQuery !== "") {
			const parsed = bboxSchema.safeParse(bboxQuery);
			if (!parsed.success) return c.json({ error: "invalid_bbox" }, 400);
			bbox = parsed.data as BBox;
		}

		const query = (c.req.query("q") ?? "").slice(0, 80);
		if (!query.trim() && !bbox) {
			const listable = levels.data.filter((level) => level === 4);
			if (listable.length === 0) {
				const total = boundaryCountAtLevels(levels.data);
				return c.json({
					total,
					truncated: total > 0,
					boundaries: [],
				});
			}
			const found = boundariesNamed(listable, "");
			return c.json({
				total: found.total,
				truncated: found.total > found.matches.length,
				boundaries: found.matches.map(compactBoundary),
			});
		}

		const found = boundariesNamed(levels.data, query, bbox);
		return c.json({
			total: found.total,
			truncated: found.total > found.matches.length,
			boundaries: found.matches.map(compactBoundary),
		});
	}

	const level = adminLevelSchema.safeParse(c.req.query("adminLevel") ?? "");
	if (!level.success) return c.json({ error: "invalid_admin_level" }, 400);

	const bboxQuery = c.req.query("bbox");
	if (bboxQuery !== undefined && bboxQuery !== "") {
		const parsed = bboxSchema.safeParse(bboxQuery);
		if (!parsed.success) return c.json({ error: "invalid_bbox" }, 400);
		const bbox = parsed.data as BBox;
		const found = boundariesInView(bbox, level.data);
		return c.json({
			total: found.length,
			truncated: found.length > MAX_BOUNDARIES,
			boundaries: found.slice(0, MAX_BOUNDARIES).map(compactBoundary),
		});
	}

	/**
	 * Name search is Germany-wide. An empty query at Bezirk/Ortsteil would
	 * dump the first hundred alphabetically — Aachen, then Aachen, then
	 * Aachener… — so those levels wait for a query. Länder fit in one page.
	 */
	const query = (c.req.query("q") ?? "").slice(0, 80);
	if (!query.trim() && level.data !== 4) {
		const total = boundaryCountAtLevels([level.data]);
		return c.json({
			total,
			truncated: total > 0,
			boundaries: [],
		});
	}

	const found = boundariesNamed(level.data, query);
	return c.json({
		total: found.total,
		truncated: found.total > found.matches.length,
		boundaries: found.matches.map(compactBoundary),
	});
});
