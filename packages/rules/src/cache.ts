import { contentHash } from "@zero-lag/geo";

/**
 * The fold commutes, so the identity of a search area is the *set* of enabled
 * constraints, not the sequence. m0-spec §9.
 *
 * `ordinal` therefore exists only to make snapshot caching deterministic, and
 * disabling a constraint in the middle of a list needs no reordering.
 */
export function searchAreaCacheKey(
	mapConfigContentHash: string,
	enabledConstraintIds: readonly string[],
): string {
	return contentHash({
		mapConfig: mapConfigContentHash,
		constraints: [...enabledConstraintIds].sort(),
	});
}
