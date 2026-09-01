import { POI_KIND_FALLBACK } from "@zero-lag/catalog";
import type { LngLat } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { ConstraintOption, type PoiConstraintKind } from "./constraint-option";
import { CoordinateCopy } from "./coordinate-copy";
import { DistanceToYou } from "./distance-to-you";
import type { MapPoi } from "./poi";
import { isStationType, type PoiTypeId, poiTypeSingular } from "./poi-type";

export type { PoiConstraintKind };

interface PoiSheetProps {
	readonly poi: MapPoi | null;
	readonly open: boolean;
	readonly onClose: () => void;
	/** GPS origin, or null when there is no fix to measure from. */
	readonly fromYou: LngLat | null;
	/** Seekers with a round: start a circle or nearest-cell cut from this pin. */
	readonly onAddConstraint?: (poi: MapPoi, kind: PoiConstraintKind) => void;
}

export function PoiSheet({
	poi,
	open,
	onClose,
	fromYou,
	onAddConstraint,
}: PoiSheetProps) {
	const shown = useHeldValue(open, poi);
	const [choosingForId, setChoosingForId] = useState<string | null>(null);
	if (!open && choosingForId !== null) {
		setChoosingForId(null);
	}
	const choosing = shown !== null && choosingForId === shown.id;

	function close() {
		setChoosingForId(null);
		onClose();
	}

	return (
		<Sheet
			actions={
				onAddConstraint && shown && !choosing ? (
					<ActionButton
						data-testid="poi-add-constraint"
						onClick={() => setChoosingForId(shown.id)}
					>
						Add a constraint
					</ActionButton>
				) : undefined
			}
			eyebrow={shown ? kindEyebrow(shown.kind, shown.insideArea) : undefined}
			onClose={close}
			open={open}
			testId="poi-sheet"
			title={shown?.name}
		>
			<div className="space-y-3">
				{shown && (
					<DistanceToYou from={fromYou} lat={shown.lat} lng={shown.lng} />
				)}
				{shown && (
					<CoordinateCopy
						point={[shown.lng, shown.lat]}
						testId="poi-coordinates"
					/>
				)}
				{shown &&
				!isStationType(shown.kind) &&
				shown.name === POI_KIND_FALLBACK[shown.kind] ? (
					<p className="text-ink-dim text-sm">No name in OpenStreetMap.</p>
				) : null}
				{choosing && shown && onAddConstraint && (
					<div className="flex flex-col gap-2">
						<ConstraintOption
							hint="A radius around this place"
							icon="circle-dashed"
							label="Circle"
							onPick={() => onAddConstraint(shown, "circle")}
							testId="poi-constraint-circle"
						/>
						<ConstraintOption
							hint={`The cell of this ${poiTypeSingular(shown.kind).toLowerCase()}`}
							icon="crosshair"
							label="Nearest"
							onPick={() => onAddConstraint(shown, "nearest")}
							testId="poi-constraint-nearest"
						/>
					</div>
				)}
			</div>
		</Sheet>
	);
}

function kindEyebrow(kind: PoiTypeId, insideArea: boolean): string {
	const where = insideArea ? "Inside the game area" : "Outside the game area";
	return `${poiTypeSingular(kind)} · ${where}`;
}
