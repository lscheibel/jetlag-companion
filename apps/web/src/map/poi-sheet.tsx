import { POI_KIND_FALLBACK, type PoiKind } from "@zero-lag/catalog";
import type { LngLat } from "@zero-lag/geo";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { DistanceToYou } from "./distance-to-you";
import type { MapPoi } from "./poi";

interface PoiSheetProps {
	readonly poi: MapPoi | null;
	readonly open: boolean;
	readonly onClose: () => void;
	/** GPS origin, or null when there is no fix to measure from. */
	readonly fromYou: LngLat | null;
}

export function PoiSheet({ poi, open, onClose, fromYou }: PoiSheetProps) {
	const shown = useHeldValue(open, poi);
	return (
		<Sheet
			eyebrow={shown ? kindEyebrow(shown.kind, shown.insideArea) : undefined}
			onClose={onClose}
			open={open}
			testId="poi-sheet"
			title={shown?.name}
		>
			<div className="space-y-3">
				{shown && (
					<DistanceToYou from={fromYou} lat={shown.lat} lng={shown.lng} />
				)}
				{shown && shown.name === POI_KIND_FALLBACK[shown.kind] ? (
					<p className="text-ink-dim text-sm">No name in OpenStreetMap.</p>
				) : null}
			</div>
		</Sheet>
	);
}

function kindEyebrow(kind: PoiKind, insideArea: boolean): string {
	const where = insideArea ? "Inside the game area" : "Outside the game area";
	return `${POI_KIND_FALLBACK[kind]} · ${where}`;
}
