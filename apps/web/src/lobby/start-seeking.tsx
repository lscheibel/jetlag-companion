import { useQuery, useZero } from "@rocicorp/zero/react";
import { elapsed } from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { InlineNotice } from "@zero-lag/ui/components/notice";
import { ScreenActions } from "@zero-lag/ui/components/screen";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { formatHms } from "../game/round-bar";
import { useNow } from "../map/use-now";
import { useLobby } from "./use-lobby";

/**
 * The host's whistle out of hiding. Confirmation sits in a sheet so starting
 * the seeking clock is a choice, not a slip, and so leftover hiding time is
 * named before it is cut short.
 */
export function StartSeekingAction() {
	const lobby = useLobby();
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const [open, setOpen] = useState(false);
	const now = useNow(1_000);
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		null;
	const openPause = pauses.find(
		(pause) => pause.roundId === round?.id && pause.endedAt === null,
	);

	if (
		!lobby.amHost ||
		round?.status !== "hiding" ||
		openPause ||
		round.hidingStartedAt === null
	) {
		return null;
	}

	const roundId = round.id;
	const remaining = Math.max(
		0,
		round.hidingDurationMs -
			elapsed(
				round.hidingStartedAt,
				pauses.filter((pause) => pause.roundId === roundId),
				now,
			),
	);
	const timeLeft = remaining > 0;

	function confirm() {
		void zero.mutate(
			mutators.round.startSeeking({
				eventId: crypto.randomUUID(),
				roundId,
			}),
		);
		setOpen(false);
	}

	return (
		<ScreenActions>
			<ActionButton
				beacon={!timeLeft}
				data-testid="start-seeking"
				onClick={() => setOpen(true)}
			>
				Start seeking
			</ActionButton>
			<Sheet
				actions={
					<ActionButton
						data-testid="confirm-start-seeking"
						onClick={confirm}
						tone={timeLeft ? "secondary" : "primary"}
					>
						Start seeking
					</ActionButton>
				}
				onClose={() => setOpen(false)}
				open={open}
				testId="start-seeking-sheet"
				title="Start seeking?"
			>
				<p className="text-sm leading-snug">
					This will start the seeking timer.
				</p>
				{timeLeft && (
					<InlineNotice
						testId="hiding-time-remaining"
						title="Hiders still have time left to hide"
						tone="warn"
					>
						{formatHms(remaining)} remaining. Starting now cuts that short.
					</InlineNotice>
				)}
			</Sheet>
		</ScreenActions>
	);
}
