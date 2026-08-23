import { CircleDraftLayer } from "./circle-draft-layer";
import { RingDraftLayer } from "./ring-draft-layer";
import type { Measure } from "./toolkit";

export function MeasureLayer({
	measure,
}: {
	readonly measure: Measure | null;
}) {
	if (!measure) return null;
	if (measure.kind === "radius") {
		return (
			<CircleDraftLayer
				center={measure.center}
				kind="measure"
				radiusMeters={measure.radiusMeters}
			/>
		);
	}
	return (
		<RingDraftLayer closed={false} kind="measure" points={measure.points} />
	);
}
