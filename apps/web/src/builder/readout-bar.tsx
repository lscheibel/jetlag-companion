import { formatArea } from "./use-builder";

interface ReadoutBarProps {
	readonly stationCount: number;
	readonly insideCount: number;
	readonly areaSquareMeters: number;
	readonly modes: readonly string[];
	/** The catalog capped the read, so these numbers are a floor. */
	readonly truncated: boolean;
}

/**
 * Stations, size, modes. m4-spec §9.
 *
 * "Share of the game boundary" is not a readout any more: the area *is* the
 * boundary now, so the share is always 100%. What replaces it is the station
 * count, which is the number a host actually uses to judge whether a map is a
 * game.
 */
export function ReadoutBar(props: ReadoutBarProps) {
	return (
		<section
			className="pointer-events-auto flex flex-wrap gap-x-4 gap-y-1 rounded bg-surface/95 px-3 py-2 text-sm shadow"
			data-testid="builder-readout"
		>
			<span data-testid="readout-stations">
				<strong>{props.insideCount}</strong> stations inside
			</span>
			<span data-testid="readout-carried">
				{props.stationCount} carried
				{props.truncated ? "+" : ""}
			</span>
			<span data-testid="readout-area">
				{formatArea(props.areaSquareMeters)}
			</span>
			{props.modes.length > 0 && (
				<span data-testid="readout-modes">{props.modes.join(" · ")}</span>
			)}
			{props.truncated && (
				<span data-testid="readout-truncated">
					counting the first {props.stationCount}
				</span>
			)}
		</section>
	);
}
