import type { BBox } from "@zero-lag/geo";
import { Hono } from "hono";
import { z } from "zod";
import { contextFromRequest } from "../auth";
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
