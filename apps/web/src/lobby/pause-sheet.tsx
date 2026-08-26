import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useState } from "react";

interface PauseSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
}

/** Why the round is stopping — asked once, then the pause actually lands. */
export function PauseSheet({ open, onClose }: PauseSheetProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [reason, setReason] = useState("");
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);
	const canPause =
		round !== undefined &&
		(round.status === "hiding" || round.status === "seeking");

	function pause() {
		if (!round || reason.trim().length === 0) return;
		void zero.mutate(
			mutators.round.pause({
				eventId: crypto.randomUUID(),
				pauseId: crypto.randomUUID(),
				roundId: round.id,
				reason: reason.trim(),
			}),
		);
		setReason("");
		onClose();
	}

	return (
		<Sheet
			actions={
				<ActionButton
					data-testid="pause-round"
					disabled={!canPause || reason.trim().length === 0}
					onClick={pause}
				>
					Pause
				</ActionButton>
			}
			onClose={onClose}
			open={open}
			testId="pause-sheet"
			title="Pause the round"
		>
			<Field
				data-testid="pause-reason"
				hint="Clocks stop. Positions keep arriving."
				label="Why?"
				onChange={(event) => setReason(event.target.value)}
				placeholder="Food, a train, a fight about the rules…"
				value={reason}
			/>
		</Sheet>
	);
}
