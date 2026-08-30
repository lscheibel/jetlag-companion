import { z } from "zod";

const lngLat = z.tuple([z.number(), z.number()]);

/**
 * What the seeker did, as opposed to what came out of it.
 *
 * `geometry` is the fold's input and is deliberately lossy about its author: a
 * Bezirk, a hand-drawn ring and a nearest-POI cell all reduce to the same
 * `polygon`, because the fold has no reason to care which. Reopening the tool
 * that made a cut does care, so the tool's own state is stored beside the
 * geometry — the boundary that was tapped, the ring's vertices, the POI type a
 * multi-circle covers. Null on rows written before this existed, and on
 * answer-derived rows, which no tool authored.
 *
 * The discriminator is the `MapTool` kind on the web client, so reopening is a
 * mapping rather than a translation. `poiKind` is a `PoiTypeId` there; a string
 * here, because which ids exist is the catalog's business, not the database's.
 */
export const constraintOrigin = z.discriminatedUnion("tool", [
	z.object({
		tool: z.literal("drawingRadiusConstraint"),
		centers: z.array(lngLat),
		radiusMeters: z.number(),
		poiKind: z.string().nullable(),
	}),
	z.object({
		tool: z.literal("drawingPolygonConstraint"),
		ring: z.array(lngLat),
	}),
	z.object({
		tool: z.literal("drawingSplitConstraint"),
		from: lngLat,
		to: lngLat,
	}),
	z.object({
		tool: z.literal("pickingBoundaryConstraint"),
		boundaryId: z.string(),
	}),
	z.object({
		tool: z.literal("pickingClosestPoiConstraint"),
		poiId: z.string(),
		filterKind: z.string().nullable(),
		radiusMeters: z.number().nullable(),
	}),
]);

export type ConstraintOrigin = z.infer<typeof constraintOrigin>;
