import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { ThemeToggle } from "@zero-lag/ui/components/theme";
import { hidersAllFound } from "./model";

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
	onClaimHost: () => void;
	onGameArea: () => void;
	onTransit: () => void;
	onHidingZone: () => void;
	onTeams: () => void;
	onLeave: () => void;
	leaving: boolean;
}

export function LobbyMenu({
	open,
	onClose,
	amHost,
	onBriefing,
	onClaimHost,
	onGameArea,
	onTransit,
	onHidingZone,
	onTeams,
	onLeave,
	leaving,
}: LobbyMenuProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const [outcomes] = useQuery(queries.hiderOutcomes());

	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);
	const openPause = round
		? pauses.find(
				(pause) => pause.roundId === round.id && pause.endedAt === null,
			)
		: undefined;
	const seeking = round?.status === "seeking" && !openPause;
	const hiderIds = round
		? round.roles
				.filter((role) => role.role === "hider")
				.map((role) => role.teamId)
		: [];
	const allFound =
		round !== undefined && hidersAllFound(hiderIds, outcomes, round.id);

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

			{amHost && seeking && round && !allFound && (
				<ActionButton
					data-testid="end-round"
					onClick={() => {
						void zero.mutate(
							mutators.round.end({
								eventId: crypto.randomUUID(),
								roundId: round.id,
							}),
						);
						onClose();
					}}
					tone="secondary"
				>
					End round
				</ActionButton>
			)}

			{/*
			 * Claiming the hat lives here. Stepping down is on your own player
			 * sheet — a host reaching for the briefing should not land on it.
			 * More than one at a time is a normal Tuesday. m1-spec §6.
			 */}
			{!amHost && (
				<ActionButton
					data-testid="claim-host"
					onClick={onClaimHost}
					tone="secondary"
				>
					Be a host too
				</ActionButton>
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

			{amHost && (
				<ActionButton
					data-testid="open-transit"
					onClick={onTransit}
					tone="secondary"
				>
					Transit
				</ActionButton>
			)}

			{amHost && (
				<ActionButton
					data-testid="open-hiding-zone"
					onClick={onHidingZone}
					tone="secondary"
				>
					Hiding zone
				</ActionButton>
			)}

			{amHost && (
				<ActionButton
					data-testid="open-teams"
					onClick={onTeams}
					tone="secondary"
				>
					Teams
				</ActionButton>
			)}

			<div className="flex flex-col gap-2">
				<p className="eyebrow">Appearance</p>
				<ThemeToggle className="w-full max-w-none" />
			</div>

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
