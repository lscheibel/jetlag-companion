import { TeamBadge, type TeamIdentity } from "../lobby/team-badge";

export type HiderOption = TeamIdentity & { readonly id: string };

interface HiderSelectorProps {
	readonly hiders: readonly HiderOption[];
	readonly selectedId: string | null;
	readonly onSelect: (teamId: string) => void;
}

/**
 * Which hider the fold on screen is about. One hider needs no chrome; two or
 * more do, because a seeker team holds a separate deduction per opponent.
 */
export function HiderSelector({
	hiders,
	selectedId,
	onSelect,
}: HiderSelectorProps) {
	if (hiders.length < 2) return null;
	return (
		<div
			className="flex min-h-11 items-center gap-1 overflow-x-auto"
			data-testid="hider-selector"
		>
			{hiders.map((hider) => {
				const selected = hider.id === selectedId;
				return (
					<button
						aria-pressed={selected}
						className={`shrink-0 rounded-full ${selected ? "ring-2 ring-foreground" : "opacity-70"}`}
						data-testid={`hider-selector-${hider.id}`}
						key={hider.id}
						onClick={() => onSelect(hider.id)}
						type="button"
					>
						<TeamBadge team={hider} />
					</button>
				);
			})}
		</div>
	);
}
