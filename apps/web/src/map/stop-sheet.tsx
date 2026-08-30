import { groupLinesByMode, type ModeId } from "@zero-lag/catalog";
import type { LngLat } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { ConstraintOption, type PoiConstraintKind } from "./constraint-option";
import { DistanceToYou } from "./distance-to-you";
import { isStationType, poiTypeSingular } from "./poi-type";
import type { SearchableStop } from "./toolkit";

const MODE_LABELS: Record<ModeId, string> = {
	tram: "Tram",
	"u-bahn": "U-Bahn",
	"s-bahn": "S-Bahn",
	regional: "RB/RE",
	"long-distance": "Long-distance",
	bus: "Bus",
	ferry: "Ferry",
	funicular: "Funicular",
};

interface StopSheetProps {
	readonly stop: SearchableStop | null;
	readonly open: boolean;
	readonly onClose: () => void;
	/** Seekers in seeking: treat this stop as the hiding zone. */
	readonly onSuspectHidingZone?: (stop: SearchableStop) => void;
	/** GPS origin, or null when there is no fix to measure from. */
	readonly fromYou: LngLat | null;
	/**
	 * Seekers with a round: start a circle or a nearest-cell cut from this
	 * station — the same two shapes the amenity sheet offers, because a station
	 * is a point of interest like any other. A hub gets one nearest-cell row per
	 * station type it serves: the cell of the U-Bahn is not the cell of the bus.
	 */
	readonly onAddConstraint?: (
		stop: SearchableStop,
		kind: PoiConstraintKind,
		modeId: ModeId | null,
	) => void;
}

/**
 * Letters, digits, punctuation — everything a station name is made of except
 * the gaps. Spaces, tabs and the rest of Unicode whitespace do not count.
 */
export function stationNameCharacterCount(name: string): number {
	return name.replace(/\s/g, "").length;
}

/**
 * Tap a station. Lines live here, not as map labels — a hub with ICE numbers
 * and buses is a long card, not a pile of text on the board.
 */
export function StopSheet({
	stop,
	open,
	onClose,
	onSuspectHidingZone,
	fromYou,
	onAddConstraint,
}: StopSheetProps) {
	const shown = useHeldValue(open, stop);
	const groups = shown ? groupLinesByMode(shown.lines) : [];
	const characterCount = shown ? stationNameCharacterCount(shown.name) : 0;
	const [choosingForId, setChoosingForId] = useState<string | null>(null);
	if (!open && choosingForId !== null) {
		setChoosingForId(null);
	}
	const choosing = shown !== null && choosingForId === shown.stopId;
	const stationTypes = shown ? shown.modeIds.filter(isStationType) : [];

	function close() {
		setChoosingForId(null);
		onClose();
	}

	return (
		<Sheet
			actions={
				onSuspectHidingZone && shown ? (
					<ActionButton
						data-testid="suspect-hiding-zone"
						onClick={() => onSuspectHidingZone(shown)}
					>
						Suspect hiding zone
					</ActionButton>
				) : undefined
			}
			eyebrow={
				shown
					? shown.insideArea
						? "Inside the game area"
						: "Outside the game area"
					: undefined
			}
			onClose={close}
			open={open}
			testId="stop-sheet"
			title={shown?.name}
		>
			<div className="space-y-3">
				{shown && (
					<p className="text-sm" data-testid="stop-name-characters">
						<span className="num">{characterCount}</span>
						{characterCount === 1 ? " character" : " characters"}
					</p>
				)}
				{shown && (
					<DistanceToYou from={fromYou} lat={shown.lat} lng={shown.lng} />
				)}
				{onAddConstraint && shown && !choosing && (
					<button
						className="min-h-tap-comfortable w-full rounded-control border border-hairline bg-surface px-3 text-sm"
						data-testid="stop-add-constraint"
						onClick={() => setChoosingForId(shown.stopId)}
						type="button"
					>
						Add a constraint
					</button>
				)}
				{choosing && shown && onAddConstraint && (
					<div className="flex flex-col gap-2">
						<ConstraintOption
							hint="A radius around this station"
							icon="circle-dashed"
							label="Circle"
							onPick={() => onAddConstraint(shown, "circle", null)}
							testId="stop-constraint-circle"
						/>
						{stationTypes.map((modeId) => (
							<ConstraintOption
								hint="The cell it sits in"
								icon="crosshair"
								key={modeId}
								label={`Nearest · ${poiTypeSingular(modeId)}`}
								onPick={() => onAddConstraint(shown, "nearest", modeId)}
								testId={`stop-constraint-nearest-${modeId}`}
							/>
						))}
					</div>
				)}
				{groups.length === 0 ? (
					<p className="text-ink-dim text-sm">
						No named lines in the catalog for this stop.
					</p>
				) : (
					<dl className="space-y-3">
						{groups.map((group) => (
							<div
								key={group.modeId}
								data-testid={`stop-lines-${group.modeId}`}
							>
								<dt className="eyebrow">{MODE_LABELS[group.modeId]}</dt>
								<dd className="text-sm">{group.names.join(" · ")}</dd>
							</div>
						))}
					</dl>
				)}
			</div>
		</Sheet>
	);
}
