import { Chip } from "@zero-lag/ui/components/chip";
import { Icon } from "@zero-lag/ui/components/icon";
import { Surface } from "@zero-lag/ui/components/surface";
import type { GamePreview } from "../api";

/**
 * What the code turned out to be.
 *
 * A game has no name of its own, so the two facts that tell somebody they are
 * joining the right thing are how many people are already waiting in it and who
 * is running it — both of which the person reading the code out is standing
 * next to.
 */

interface GamePreviewCardProps {
	preview: GamePreview;
}

export function GamePreviewCard({ preview }: GamePreviewCardProps) {
	const running = preview.status === "running";

	return (
		<Surface
			className="flex items-center gap-3 border-live/40 bg-live/[0.07]"
			data-testid="join-preview"
		>
			<span
				aria-hidden
				className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised"
			>
				<Icon name="flag-banner" size="md" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="num font-semibold text-[0.95rem] tracking-[0.14em]">
					{preview.code}
				</div>
				<p className="mt-0.5 text-ink-dim text-xs leading-snug">
					{waiting(preview)}
					{preview.hostName && ` · ${preview.hostName} is hosting`}
				</p>
			</div>
			<Chip dot={!running} tone={running ? "stale" : "live"}>
				{running ? "Under way" : "Open"}
			</Chip>
		</Surface>
	);
}

function waiting({ status, playerCount }: GamePreview): string {
	const people = playerCount === 1 ? "1 player" : `${playerCount} players`;
	return status === "running" ? `${people} playing` : `${people} waiting`;
}
