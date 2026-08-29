import { groupLinesByMode, type ModeId } from "@zero-lag/catalog";
import type { LngLat } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { DistanceToYou } from "./distance-to-you";
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
}: StopSheetProps) {
	const shown = useHeldValue(open, stop);
	const groups = shown ? groupLinesByMode(shown.lines) : [];
	const characterCount = shown ? stationNameCharacterCount(shown.name) : 0;

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
			onClose={onClose}
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
