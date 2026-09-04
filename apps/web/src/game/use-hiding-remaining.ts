import { useQuery } from "@rocicorp/zero/react";
import { hidingTimeRemaining } from "@zero-lag/rules";
import { queries } from "@zero-lag/schema";
import { useNow } from "../map/use-now";

/**
 * Hiding time left on the live round, or null when nothing is counting down —
 * the round is past hiding, or hiding has no instant to count from.
 *
 * Every player reads the same number: the bar's countdown, the host's whistle
 * and the warning beside a seeker's question are one clock, not three that
 * drift a second apart.
 */
export function useHidingRemaining(): number | null {
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const now = useNow(1_000);
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		null;

	if (round?.status !== "hiding" || round.hidingStartedAt === null) return null;

	const roundId = round.id;
	return hidingTimeRemaining(
		round.hidingDurationMs,
		round.hidingStartedAt,
		pauses.filter((pause) => pause.roundId === roundId),
		now,
	);
}
