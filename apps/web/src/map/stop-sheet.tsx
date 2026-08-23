import { groupLinesByMode, type ModeId } from "@zero-lag/catalog";
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
	readonly stop: SearchableStop;
	readonly onClose: () => void;
}

/**
 * Tap a station. Lines live here, not as map labels — a hub with ICE numbers
 * and buses is a long card, not a pile of text on the board.
 */
export function StopSheet({ stop, onClose }: StopSheetProps) {
	const groups = groupLinesByMode(stop.lines);

	return (
		<section
			className="absolute inset-x-0 bottom-0 z-30 max-h-[70%] space-y-2 overflow-y-auto rounded-t-xl border-t bg-background p-4 shadow-lg"
			data-testid="stop-sheet"
		>
			<header className="flex items-start gap-3">
				<div className="min-w-0">
					<h2 className="font-semibold text-lg">{stop.name}</h2>
					<p className="text-muted-foreground text-sm">
						{stop.insideArea ? "Inside the game area" : "Outside the game area"}
					</p>
				</div>
				<button
					className="ml-auto min-h-11 shrink-0 rounded border px-3"
					data-testid="close-stop-sheet"
					onClick={onClose}
					type="button"
				>
					Close
				</button>
			</header>

			{groups.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No named lines in the catalog for this stop.
				</p>
			) : (
				<dl className="space-y-3">
					{groups.map((group) => (
						<div key={group.modeId} data-testid={`stop-lines-${group.modeId}`}>
							<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{MODE_LABELS[group.modeId]}
							</dt>
							<dd className="text-sm">{group.names.join(" · ")}</dd>
						</div>
					))}
				</dl>
			)}
		</section>
	);
}
