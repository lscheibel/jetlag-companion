import type { LngLat } from "@zero-lag/geo";
import { RingDraftLayer } from "./ring-draft-layer";

interface DrawLayerProps {
	readonly ring: readonly LngLat[];
}

/**
 * The ring in progress. m4-spec §9.
 *
 * Same geometry as a measure path, with the closing segment drawn once there
 * are three vertices so the host sees the shape they are about to get.
 */
export function DrawLayer({ ring }: DrawLayerProps) {
	return <RingDraftLayer closed kind="draw" points={ring} />;
}
