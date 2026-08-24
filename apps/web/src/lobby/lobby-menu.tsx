import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";

/**
 * The things a game has that are not the screen you are on.
 *
 * Leaving lives here rather than on the board because it is the one control in
 * the lobby nobody should be able to hit while reaching for something else —
 * and because a button that ends your evening does not belong next to the ones
 * that arrange it.
 */

interface LobbyMenuProps {
	open: boolean;
	onClose: () => void;
	amHost: boolean;
	onBriefing: () => void;
	onHostToggle: () => void;
	onGameArea: () => void;
	onLeave: () => void;
	leaving: boolean;
	/** Null once a round is running: a clock that has started is not a setting. */
	hidingMinutes: string | null;
	onHidingMinutes: (minutes: string) => void;
}

export function LobbyMenu({
	open,
	onClose,
	amHost,
	onBriefing,
	onHostToggle,
	onGameArea,
	onLeave,
	leaving,
	hidingMinutes,
	onHidingMinutes,
}: LobbyMenuProps) {
	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="lobby-menu-sheet"
			title="This game"
		>
			{/*
			 * The briefing stays reachable after it has been read once: it is the
			 * only place the area, the clock and the house rules are said together,
			 * and "what were we playing again" is a question people ask twice.
			 */}
			<ActionButton
				data-testid="open-briefing"
				onClick={onBriefing}
				tone="secondary"
			>
				The briefing
			</ActionButton>

			{/*
			 * The hat, claimable by anyone and droppable by whoever is wearing it.
			 * More than one at a time is a normal Tuesday rather than a conflict, so
			 * this is a plain toggle and never a transfer. m1-spec §6.
			 */}
			<ActionButton
				data-testid={amHost ? "release-host" : "claim-host"}
				onClick={onHostToggle}
				tone="secondary"
			>
				{amHost ? "Stop hosting" : "Be a host too"}
			</ActionButton>

			{amHost && hidingMinutes !== null && (
				<label className="flex min-h-tap-comfortable items-center gap-3 rounded-control border border-hairline bg-surface px-3">
					<span className="eyebrow flex-1">Time to hide</span>
					<input
						className="num w-16 rounded-control border border-hairline bg-surface px-2 py-1 text-right text-ink"
						data-testid="hiding-duration"
						inputMode="numeric"
						min={1}
						onChange={(event) => onHidingMinutes(event.target.value)}
						type="number"
						value={hidingMinutes}
					/>
					<span className="eyebrow">min</span>
				</label>
			)}

			{/* The area is a host act. The editor lives under setup so it can
			    reuse the pieces the wizard already holds. */}
			{amHost && (
				<ActionButton
					data-testid="open-builder"
					onClick={onGameArea}
					tone="secondary"
				>
					Game area
				</ActionButton>
			)}

			<ActionButton
				data-testid="leave-game"
				disabled={leaving}
				onClick={onLeave}
				tone="danger"
			>
				{leaving ? "Leaving…" : "Leave game"}
			</ActionButton>

			<p className="text-center text-ink-dim text-xs leading-snug">
				Leaving takes you off your team. Coming back is free — the code still
				works.
			</p>
		</Sheet>
	);
}
