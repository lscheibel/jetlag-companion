import { Icon } from "@zero-lag/ui/components/icon";
import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { fadeOnly, listItem } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { LobbyTeamView } from "./model";

/**
 * A team on the board, with the people on it underneath.
 *
 * One list, not two: a lobby that shows teams in one place and people in
 * another makes the group work out who is where by reading both. The header
 * opens the identity drawer, because on a board of five teams the thing a hand
 * reaches for is the team rather than a control beside it.
 *
 * A team nobody is on says so **where its members would be**, in the alert
 * colour, in the row their names would occupy. That is the whole warning: a
 * card above the button repeating it would be the same sentence twice, and the
 * empty row is the one that can be pointed at.
 */

interface TeamRowProps {
	team: LobbyTeamView;
	/** The viewer is on this team. */
	mine: boolean;
	onOpen: () => void;
	/** Found / still hiding, above the people. */
	result?: ReactNode;
	/** The people on it, rendered by the lobby so it owns the person controls. */
	children?: ReactNode;
}

export function TeamRow({
	team,
	mine,
	onOpen,
	result,
	children,
}: TeamRowProps) {
	const reduced = useReducedMotion();
	const empty = team.members.length === 0;

	return (
		<motion.div
			className="flex flex-col gap-1"
			variants={reduced ? fadeOnly : listItem}
		>
			<button
				className={cn(
					"flex w-full items-center gap-2.5 rounded-tile border border-hairline border-l-[5px] bg-surface px-3 py-2 text-left",
					"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:translate-x-0.5 active:scale-[0.99]",
					mine && "border-action/40 bg-action/[0.07]",
				)}
				data-testid={`team-${team.name}`}
				onClick={onOpen}
				style={{ borderLeftColor: team.color }}
				type="button"
			>
				<TeamBadge team={team} variant="mark" />
				<span className="min-w-0 flex-1 font-display font-extrabold text-[0.95rem] tracking-tight">
					{team.name}
				</span>
				<span className="text-ink-faint">
					<Icon name="caret-right" size="sm" />
				</span>
			</button>

			{result}

			<div className="flex flex-col gap-1" data-testid={`members-${team.name}`}>
				{empty ? (
					<p
						className={cn(
							"flex min-h-tap items-center gap-2 rounded-control border border-stale/45 border-dashed",
							"bg-stale/[0.07] px-3 text-[0.8rem] text-stale italic",
						)}
						data-testid={`empty-${team.name}`}
					>
						<span
							aria-hidden
							className="zl-breathe size-1.5 shrink-0 rounded-full bg-stale"
						/>
						Nobody on this team yet
					</p>
				) : (
					children
				)}
			</div>
		</motion.div>
	);
}
