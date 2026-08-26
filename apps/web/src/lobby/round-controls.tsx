import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";

interface RoundControlsProps {
	amHost: boolean;
}

/**
 * Resume, when a pause is open. Phase and ordinal live in the header now.
 */
export function RoundControls({ amHost }: RoundControlsProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);
	const openPause = round
		? pauses.find(
				(pause) => pause.roundId === round.id && pause.endedAt === null,
			)
		: undefined;

	if (!amHost || !round || !openPause) return null;

	return (
		<ActionButton
			data-testid="resume-round"
			onClick={() =>
				void zero.mutate(
					mutators.round.resume({
						eventId: crypto.randomUUID(),
						roundId: round.id,
					}),
				)
			}
			size="comfortable"
		>
			Resume
		</ActionButton>
	);
}
