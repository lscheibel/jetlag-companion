import * as namespace from "polygon-clipping";

/**
 * polygon-clipping ships three builds. The CJS one exports the four operations
 * by name and its bundled `.d.ts` describes that shape; the ESM one exports
 * only a default object. A bundler or test runner may hand us either, and the
 * failure mode is `difference is not a function` at runtime with a green
 * typecheck — so the interop is resolved here, once, rather than at each call.
 */
type ClippingOperations = {
	union(
		geom: clippingNamespace.MultiPolygon,
		...geoms: clippingNamespace.MultiPolygon[]
	): clippingNamespace.MultiPolygon;
	intersection(
		geom: clippingNamespace.MultiPolygon,
		...geoms: clippingNamespace.MultiPolygon[]
	): clippingNamespace.MultiPolygon;
	difference(
		subject: clippingNamespace.MultiPolygon,
		...clips: clippingNamespace.MultiPolygon[]
	): clippingNamespace.MultiPolygon;
};

import type * as clippingNamespace from "polygon-clipping";

export type ClipPair = clippingNamespace.Pair;
export type ClipMultiPolygon = clippingNamespace.MultiPolygon;

const operations = ((namespace as { default?: ClippingOperations }).default ??
	namespace) as ClippingOperations;

export const { union, intersection, difference } = operations;
