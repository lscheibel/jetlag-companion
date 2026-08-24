import { Sheet } from "@zero-lag/ui/components/sheet";
import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { cn } from "@zero-lag/ui/lib/utils";
import type { ReactNode } from "react";
import { byNeed, type LobbyTeamView, sideWord } from "./model";

/**
 * Which team somebody joins — themselves, or because a host said so.
 *
 * Ordered by how much a team needs somebody: the empty one first, then the
 * smallest. Whoever is doing this is usually solving a shortage rather than
 * browsing. Every row says which side it plays and how many are on it, which is
 * the whole basis of the decision.
 *
 * It lands immediately on the other person's phone. No invitation and no
 * confirmation: teams get rearranged out loud in a group of friends.
 */

interface PickTeamSheetProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	subtitle?: ReactNode;
	teams: readonly LobbyTeamView[];
	/** The team the person is already on, which is not a move. */
	currentTeamId?: string | null;
	onPick: (team: LobbyTeamView) => void;
}

export function PickTeamSheet({
	open,
	onClose,
	title,
	subtitle,
	teams,
	currentTeamId = null,
	onPick,
}: PickTeamSheetProps) {
	const choices = byNeed(teams).filter((team) => team.id !== currentTeamId);

	return (
		<Sheet
			eyebrow={subtitle}
			onClose={onClose}
			open={open}
			testId="pick-team"
			title={title}
		>
			{choices.length === 0 && (
				<p className="text-ink-dim text-sm">
					There is nowhere else to go yet — this is the only team.
				</p>
			)}
			{choices.map((team) => (
				<button
					className={cn(
						"flex min-h-tap-comfortable items-center gap-3 rounded-control border-2 border-hairline bg-surface px-3 py-2",
						"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:translate-x-0.5",
						team.members.length === 0 && "border-action/50 bg-action/[0.06]",
					)}
					data-testid={`join-${team.name}`}
					key={team.id}
					onClick={() => onPick(team)}
					type="button"
				>
					<TeamBadge size="sm" team={team} variant="mark" />
					<span className="min-w-0 flex-1 truncate font-semibold text-sm">
						{team.name}
					</span>
					<span className="eyebrow shrink-0">
						{sideWord(team.role)} ·{" "}
						{team.members.length === 0 ? "empty" : team.members.length}
					</span>
				</button>
			))}
		</Sheet>
	);
}
