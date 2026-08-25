import { groupLinesByMode, type ModeId } from "@zero-lag/catalog";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
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
}

/**
 * Tap a station. Lines live here, not as map labels — a hub with ICE numbers
 * and buses is a long card, not a pile of text on the board.
 */
export function StopSheet({ stop, open, onClose }: StopSheetProps) {
	const shown = useHeldValue(open, stop);
	const groups = shown ? groupLinesByMode(shown.lines) : [];

	return (
		<Sheet
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
			{groups.length === 0 ? (
				<p className="text-ink-dim text-sm">
					No named lines in the catalog for this stop.
				</p>
			) : (
				<dl className="space-y-3">
					{groups.map((group) => (
						<div key={group.modeId} data-testid={`stop-lines-${group.modeId}`}>
							<dt className="eyebrow">{MODE_LABELS[group.modeId]}</dt>
							<dd className="text-sm">{group.names.join(" · ")}</dd>
						</div>
					))}
				</dl>
			)}
		</Sheet>
	);
}
