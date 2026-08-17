/**
 * The one component that renders a team. m1-spec §4.
 *
 * One, because M2's map markers, M7's thread headers and M13's hider selector
 * will all render a team, and three hand-rolled versions drift until one of them
 * drops the emoji on the day somebody plays in gloves and sunglasses.
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
}

export function TeamBadge({ team }: TeamBadgeProps) {
	return (
		// No test id of its own: a badge appears more than once per screen, and the
		// thing a test means by "the Hiders" is the card or the row it is in.
		<span
			className="inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 font-semibold text-base"
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
