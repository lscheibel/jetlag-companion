import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { HoldButton } from "@zero-lag/ui/components/hold-button";
import { InlineNotice } from "@zero-lag/ui/components/notice";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { formatHms } from "../game/round-clock";
import { useHidingRemaining } from "../game/use-hiding-remaining";
import { LobbyScreenActions } from "./lobby-actions";
import { useLobby } from "./use-lobby";

export interface StartSeekingWhistle {
	/** Hiding time that starting now would cut short. */
	readonly remainingMs: number;
	readonly timeLeft: boolean;
	readonly confirm: () => void;
}

/**
 * The host's whistle out of hiding, wherever it is offered — the lobby's
 * pinned action, or the map's actions sheet. Null when this player cannot
 * blow it: not the host, not hiding, or paused.
 */
export function useStartSeeking(): StartSeekingWhistle | null {
	const lobby = useLobby();
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const remainingMs = useHidingRemaining();
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		null;
	const openPause = pauses.find(
		(pause) => pause.roundId === round?.id && pause.endedAt === null,
	);

	if (!lobby.amHost || !round || openPause || remainingMs === null) {
		return null;
	}

	const roundId = round.id;

	return {
		remainingMs,
		timeLeft: remainingMs > 0,
		confirm() {
			void zero.mutate(
				mutators.round.startSeeking({
					eventId: crypto.randomUUID(),
					roundId,
				}),
			);
		},
	};
}

/** What starting now would cut short. Silent once hiding time has run out. */
function HidingTimeLeft({
	whistle,
}: {
	readonly whistle: StartSeekingWhistle;
}) {
	if (!whistle.timeLeft) return null;

	return (
		<InlineNotice
			testId="hiding-time-remaining"
			title="Hiders still have time left to hide"
			tone="warn"
		>
			{formatHms(whistle.remainingMs)} remaining. Starting now cuts that short.
		</InlineNotice>
	);
}

/**
 * The whistle offered inline: the warning about what it cuts short, then the
 * hold itself. For a sheet that is already the place the player decided in —
 * stacking a confirmation sheet on top of one would be a second decision
 * about the same thing.
 */
export function StartSeekingHold({
	whistle,
	onDone,
}: {
	readonly whistle: StartSeekingWhistle;
	readonly onDone?: () => void;
}) {
	return (
		<>
			<HidingTimeLeft whistle={whistle} />
			<HoldButton
				hint="Starts seeking timer"
				onConfirm={() => {
					whistle.confirm();
					onDone?.();
				}}
				testId="confirm-start-seeking"
				tone={whistle.timeLeft ? "primary" : "live"}
			>
				Hold to start seeking
			</HoldButton>
		</>
	);
}

interface StartSeekingSheetProps {
	readonly whistle: StartSeekingWhistle;
	readonly open: boolean;
	readonly onClose: () => void;
}

/**
 * The confirmation behind the whistle. The sheet names the leftover hiding
 * time before it is cut short; the hold is the confirmation, so a tap cannot
 * slip.
 */
export function StartSeekingSheet({
	whistle,
	open,
	onClose,
}: StartSeekingSheetProps) {
	return (
		<Sheet
			actions={
				<HoldButton
					onConfirm={() => {
						whistle.confirm();
						onClose();
					}}
					testId="confirm-start-seeking"
					tone={whistle.timeLeft ? "primary" : "live"}
				>
					Hold to start seeking
				</HoldButton>
			}
			onClose={onClose}
			open={open}
			testId="start-seeking-sheet"
			title="Start seeking?"
		>
			<p className="text-sm leading-snug">This will start the seeking timer.</p>
			<HidingTimeLeft whistle={whistle} />
		</Sheet>
	);
}

/** The whistle where the host waits it out: the lobby's pinned action. */
export function StartSeekingAction() {
	const whistle = useStartSeeking();
	const [open, setOpen] = useState(false);

	if (!whistle) return null;

	return (
		<LobbyScreenActions
			after={
				<StartSeekingSheet
					onClose={() => setOpen(false)}
					open={open}
					whistle={whistle}
				/>
			}
		>
			<ActionButton
				beacon={!whistle.timeLeft}
				data-testid="start-seeking"
				onClick={() => setOpen(true)}
			>
				Start seeking
			</ActionButton>
		</LobbyScreenActions>
	);
}
