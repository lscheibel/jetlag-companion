import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";
import { LobbyScreenActions } from "./lobby-actions";
import { hidersAllFound } from "./model";
import { useLobby } from "./use-lobby";

function useAllHidersFound(): boolean {
	const [rounds] = useQuery(queries.rounds());
	const [outcomes] = useQuery(queries.hiderOutcomes());
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		null;
	if (round?.status !== "seeking") return false;
	const hiderIds = round.roles
		.filter((role) => role.role === "hider")
		.map((role) => role.teamId);
	return hidersAllFound(hiderIds, outcomes, round.id);
}

/**
 * Once a round is running, the lobby's job is to send people back to the map.
 * Hosts still in hiding keep Start seeking instead — that is the whistle.
 * When every hider is found, End round takes this slot for every team.
 */
export function PlayMapAction() {
	const lobby = useLobby();
	const { session } = useGameShell();
	const role = useMyRole(session.playerId);
	const navigate = useNavigate();
	const allFound = useAllHidersFound();
	const status = lobby.round?.status ?? null;
	const hostStillHiding = lobby.amHost && status === "hiding";

	if (
		allFound ||
		hostStillHiding ||
		status === "pending" ||
		status === "ended" ||
		!status
	) {
		return null;
	}

	const toMap = () => void navigate(`/g/${session.code}/map`);

	if (role.role === "seeker" && status === "seeking") {
		return (
			<LobbyScreenActions>
				<ActionButton
					beacon
					data-testid="lobby-open-map"
					hint="Open the map"
					onClick={toMap}
				>
					Go look for them
				</ActionButton>
			</LobbyScreenActions>
		);
	}

	if (role.role === "hider") {
		return (
			<LobbyScreenActions>
				<ActionButton
					data-testid="lobby-open-map"
					hint="On the map"
					onClick={toMap}
				>
					Track the seekers
				</ActionButton>
			</LobbyScreenActions>
		);
	}

	return null;
}

/** Replaces the map CTA once every hider team has been marked found. */
export function EndRoundAction() {
	const lobby = useLobby();
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const allFound = useAllHidersFound();
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		null;

	if (!allFound || round?.status !== "seeking") return null;

	const roundId = round.id;

	return (
		<LobbyScreenActions>
			<ActionButton
				beacon
				data-testid="end-round"
				disabled={!lobby.amHost}
				hint="Hiders found"
				onClick={() => {
					void zero.mutate(
						mutators.round.end({
							eventId: crypto.randomUUID(),
							roundId,
						}),
					);
				}}
			>
				End round
			</ActionButton>
		</LobbyScreenActions>
	);
}
