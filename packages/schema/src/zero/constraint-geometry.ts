import { z } from "zod";

const lngLat = z.tuple([z.number(), z.number()]);
const multiPolygon = z.array(z.array(z.array(lngLat)));

/**
 * Mirrors `ConstraintGeometry` in @zero-lag/rules. Stored radius rows may still
 * have a single `center`; new writes always use `centers`.
 */
export const constraintGeometry = z.union([
	z
		.object({
			kind: z.literal("radius"),
			radius: z.number(),
			center: lngLat.optional(),
			centers: z.array(lngLat).min(1).optional(),
		})
		.transform((value, ctx) => {
			const centers =
				value.centers && value.centers.length > 0
					? value.centers
					: value.center
						? [value.center]
						: [];
			if (centers.length === 0) {
				ctx.addIssue({
					code: "custom",
					message: "radius needs at least one center",
					path: ["centers"],
				});
				return z.NEVER;
			}
			return {
				kind: "radius" as const,
				centers,
				radius: value.radius,
			};
		}),
	z.object({
		kind: z.literal("halfPlane"),
		a: lngLat,
		b: lngLat,
		nearer: z.enum(["a", "b"]),
	}),
	z.object({ kind: z.literal("polygon"), polygons: multiPolygon }),
	z.object({
		kind: z.literal("sector"),
		center: lngLat,
		radius: z.number(),
		fromDeg: z.number(),
		toDeg: z.number(),
	}),
]);
