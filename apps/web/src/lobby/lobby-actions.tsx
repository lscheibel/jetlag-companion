import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { ScreenActions } from "@zero-lag/ui/components/screen";
import { type ReactNode, useState } from "react";
import { PauseSheet } from "./pause-sheet";
import { useLobby } from "./use-lobby";

const SQUARE_ACTION =
	"shrink-0 [&_.zl-press-face]:size-tap-primary [&_.zl-press-face]:items-center [&_.zl-press-face]:justify-center [&_.zl-press-face]:px-0";

/**
 * The lobby's pinned action row: an optional pause square, then the primary
 * CTA. Pause still opens the reason sheet; it just is not buried in the menu.
 */
export function LobbyScreenActions({
	children,
	note,
	after,
}: {
	readonly children: ReactNode;
	readonly note?: ReactNode;
	readonly after?: ReactNode;
}) {
	return (
		<ScreenActions note={note}>
			<div className="flex items-stretch gap-2">
				<PauseButton />
				<div className="min-w-0 flex-1">{children}</div>
			</div>
			{after}
		</ScreenActions>
	);
}

function PauseButton() {
	const lobby = useLobby();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const [open, setOpen] = useState(false);
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);
	const openPause = round
		? pauses.find(
				(pause) => pause.roundId === round.id && pause.endedAt === null,
			)
		: undefined;
	const running =
		round !== undefined &&
		(round.status === "hiding" || round.status === "seeking") &&
		!openPause;

	if (!lobby.amHost || !running) return null;

	return (
		<>
			<ActionButton
				aria-label="Pause"
				className={SQUARE_ACTION}
				data-testid="open-pause"
				inline
				onClick={() => setOpen(true)}
				size="primary"
				tone="secondary"
			>
				<Icon name="pause" size="md" />
			</ActionButton>
			<PauseSheet onClose={() => setOpen(false)} open={open} />
		</>
	);
}
