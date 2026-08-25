import { Sheet } from "@zero-lag/ui/components/sheet";
import {
	TeamBadge,
	type TeamIdentity,
} from "@zero-lag/ui/components/team-badge";
import { cn } from "@zero-lag/ui/lib/utils";

export type HiderOption = TeamIdentity & { readonly id: string };

interface HiderChipProps {
	readonly hiders: readonly HiderOption[];
	readonly selectedId: string | null;
	readonly onOpen: () => void;
}

/**
 * Which hider the fold on screen is about. A seeker team holds a separate
 * deduction per opponent, so the bar says which and the sheet is how you
 * switch.
 */
export function HiderChip({ hiders, selectedId, onOpen }: HiderChipProps) {
	const selected =
		hiders.find((hider) => hider.id === selectedId) ?? hiders[0] ?? null;
	if (!selected) return null;

	return (
		<button
			className={cn(
				"flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-tile border border-hairline border-l-[5px] bg-surface px-3 py-2 text-left",
				"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:translate-x-0.5",
			)}
			data-testid="hider-selector"
			onClick={onOpen}
			style={{ borderLeftColor: selected.color }}
			type="button"
		>
			<TeamBadge size="sm" team={selected} variant="mark" />
			<span className="min-w-0 flex-1 truncate font-display font-extrabold text-[0.95rem] tracking-tight">
				{selected.name}
			</span>
			<span aria-hidden className="text-ink-faint text-sm">
				›
			</span>
		</button>
	);
}

interface HiderTeamSheetProps {
	readonly open: boolean;
	readonly hiders: readonly HiderOption[];
	readonly selectedId: string | null;
	readonly onSelect: (teamId: string) => void;
	readonly onClose: () => void;
}

export function HiderTeamSheet({
	open,
	hiders,
	selectedId,
	onSelect,
	onClose,
}: HiderTeamSheetProps) {
	const selected =
		hiders.find((hider) => hider.id === selectedId) ?? hiders[0] ?? null;

	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="hider-team-sheet"
			title="Which hider?"
		>
			{hiders.map((hider) => {
				const on = hider.id === selected?.id;
				return (
					<button
						aria-pressed={on}
						className={cn(
							"flex min-h-tap-comfortable items-center gap-3 rounded-control border-2 bg-surface px-3 py-2",
							"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:translate-x-0.5",
							on ? "border-action bg-action/[0.08]" : "border-hairline",
						)}
						data-testid={`hider-selector-${hider.id}`}
						key={hider.id}
						onClick={() => {
							onSelect(hider.id);
							onClose();
						}}
						type="button"
					>
						<TeamBadge size="sm" team={hider} variant="mark" />
						<span className="min-w-0 flex-1 truncate font-semibold text-sm">
							{hider.name}
						</span>
					</button>
				);
			})}
		</Sheet>
	);
}
