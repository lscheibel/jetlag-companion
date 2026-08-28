import { POI_KIND_FALLBACK, type PoiKind } from "@zero-lag/catalog";
import type { LngLat } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { DistanceToYou } from "./distance-to-you";
import type { MapPoi } from "./poi";

export type PoiConstraintKind = "circle" | "nearest";

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
				{shown && shown.name === POI_KIND_FALLBACK[shown.kind] ? (
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
							hint={`The cell of this ${POI_KIND_FALLBACK[shown.kind].toLowerCase()}`}
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

function ConstraintOption({
	icon,
	label,
	hint,
	testId,
	onPick,
}: {
	readonly icon: IconName;
	readonly label: string;
	readonly hint: string;
	readonly testId: string;
	readonly onPick: () => void;
}) {
	return (
		<button
			className="flex w-full items-center gap-3 rounded-control border border-hairline bg-surface px-3 py-2.5 text-left"
			data-testid={testId}
			onClick={onPick}
			type="button"
		>
			<span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised">
				<Icon name={icon} size="md" />
			</span>
			<span className="min-w-0 flex-1">
				<b className="block text-[0.85rem] leading-tight">{label}</b>
				<span className="eyebrow mt-0.5 block text-ink-dim">{hint}</span>
			</span>
		</button>
	);
}

function kindEyebrow(kind: PoiKind, insideArea: boolean): string {
	const where = insideArea ? "Inside the game area" : "Outside the game area";
	return `${POI_KIND_FALLBACK[kind]} · ${where}`;
}
