import { cn } from "../lib/utils";

/**
 * The one component that renders a team. m1-spec §4.
 *
 * One, because the map's markers, a thread's header and the hider selector all
 * render a team, and three hand-rolled versions drift until one of them drops
 * the emoji on the day somebody plays in gloves and sunglasses.
 *
 * Emoji, name, colour — in that order of legibility, and colour is never the
 * only channel.
 */

export interface TeamIdentity {
	readonly name: string;
	readonly color: string;
	readonly emoji: string;
}

interface TeamBadgeProps {
	team: TeamIdentity;
	/** `mark` is the emoji tile alone, for map markers and dense rows. */
	variant?: "full" | "mark";
	size?: "sm" | "md";
	className?: string;
}

export function TeamBadge({
	team,
	variant = "full",
	size = "md",
	className,
}: TeamBadgeProps) {
	if (variant === "mark") {
		return (
			<span
				className={cn(
					"grid shrink-0 place-items-center rounded-[11px] shadow-[inset_0_0_0_2px_rgb(255_255_255/0.18)]",
					size === "sm" ? "size-7 text-sm" : "size-9 text-lg",
					className,
				)}
				data-team-color={team.color}
				style={{ backgroundColor: team.color }}
				title={team.name}
			>
				<span aria-hidden>{team.emoji}</span>
				<span className="sr-only">{team.name}</span>
			</span>
		);
	}

	return (
		// No test id of its own: a badge appears more than once per screen, and the
		// thing a test means by "the Hiders" is the card or the row it is in.
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-chip border-2 px-3 py-1 font-semibold",
				size === "sm" ? "text-sm" : "text-base",
				className,
			)}
			style={{ borderColor: team.color }}
		>
			<span aria-hidden className="text-lg leading-none">
				{team.emoji}
			</span>
			<span
				aria-hidden
				className="size-3 shrink-0 rounded-full"
				// The swatch as data rather than as a parsed style string, so a test
				// can assert two teams are distinguishable without reading CSS.
				data-team-color={team.color}
				style={{ backgroundColor: team.color }}
			/>
			<span>{team.name}</span>
		</span>
	);
}
