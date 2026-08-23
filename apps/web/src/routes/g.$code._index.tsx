import { useQuery } from "@rocicorp/zero/react";
import { queries, type TeamRole } from "@zero-lag/schema";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import {
	LobbyProvider,
	useLobbyActions,
	useLobbyRejection,
} from "../lobby/actions";
import { HostBanner } from "../lobby/host-banner";
import type { LobbyPlayer } from "../lobby/player-row";
import { RolePanel } from "../lobby/role-panel";
import { RosterPanel } from "../lobby/roster-panel";
import { OutcomeList } from "../lobby/outcome-list";
import { RoundControls } from "../lobby/round-controls";
import { RulesCard } from "../lobby/rules-card";
import { ShareCard } from "../lobby/share-card";
import type { LobbyTeam } from "../lobby/team-card";
import { useIsHost } from "../lobby/use-is-host";
import { rejectionMessage } from "../lobby/use-rejections";
import { clearSession } from "../session";

/**
 * The lobby. m1-spec §11.
 *
 * Field-hostile from the first screen, per the build plan's eighth principle:
 * 44px targets, a join code that survives glare, and nothing carried by colour
 * alone. It is used standing on a platform, not sitting down.
 *
 * It deliberately does **not** track position. Identity, online-ness and
 * battery are all it subscribes to; the location watch and the position log
 * both belong to a round that has started, and a lobby that quietly drains 8%
 * of everyone's battery while the group argues about team names is a bad first
 * impression and an avoidable one. m1-spec §9.
 */
export default function LobbyRoute() {
	return (
		<LobbyProvider>
			<Lobby />
		</LobbyProvider>
	);
}

function Lobby() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const [players] = useQuery(queries.players());
	const [teams] = useQuery(queries.teams());
	const [rounds] = useQuery(queries.rounds());
	const amHost = useIsHost(session.playerId);
	const { leaveGame } = useLobbyActions();
	const { rejection, dismiss } = useLobbyRejection();
	const [leaving, setLeaving] = useState(false);

	/**
	 * The live round is the highest-ordinal one that has not ended — the same
	 * rule `useMyRole` uses, and `pending` is not ended. There is always exactly
	 * one, because round 1 is created with the game. m1-spec §3.
	 */
	const round = [...rounds].reverse().find((value) => value.status !== "ended");

	const roleByTeamId = useMemo(() => {
		const map = new Map<string, TeamRole>();
		for (const role of round?.roles ?? []) map.set(role.teamId, role.role);
		return map;
	}, [round]);

	const active = players.filter((player) => player.leftAt === null);
	const removed = players.filter((player) => player.removedByPlayerId !== null);

	const lobbyTeams: LobbyTeam[] = teams.map((team) => ({
		id: team.id,
		name: team.name,
		color: team.color,
		emoji: team.emoji,
		members: team.members.flatMap((member) =>
			member.player && member.player.leftAt === null
				? [toLobbyPlayer(member.player)]
				: [],
		),
	}));

	const assigned = new Set(
		lobbyTeams.flatMap((team) => team.members.map((member) => member.id)),
	);
	const unassigned = active
		.filter((player) => !assigned.has(player.id))
		.map(toLobbyPlayer);

	/**
	 * The session is not cleared until the others have been told. Underground
	 * that means the button stays busy until the signal comes back, which is the
	 * truth: you have not left a lobby that does not know you have.
	 */
	function leave() {
		setLeaving(true);
		void leaveGame().then(() => {
			clearSession();
			void navigate("/");
		});
	}

	return (
		<main className="mx-auto max-w-2xl space-y-4 p-4">
			<ShareCard code={session.code} />
			<HostBanner />
			<RulesCard amHost={amHost} />

			{rejection && (
				<div
					className="flex items-center gap-3 rounded border border-amber-500 p-3 text-sm"
					data-testid="rejection-notice"
				>
					<span>{rejectionMessage(rejection)}</span>
					<button
						className="ml-auto min-h-11 rounded border px-3"
						data-testid="dismiss-rejection"
						onClick={dismiss}
						type="button"
					>
						OK
					</button>
				</div>
			)}

			<RosterPanel
				amHost={amHost}
				myPlayerId={session.playerId}
				removed={removed.map(toLobbyPlayer)}
				roleByTeamId={roleByTeamId}
				teams={lobbyTeams}
				unassigned={unassigned}
			/>

			<RolePanel
				amHost={amHost}
				roleByTeamId={roleByTeamId}
				roundId={round?.id ?? null}
				teams={lobbyTeams}
			/>
			<RoundControls amHost={amHost} />
			<OutcomeList token={session.token} />

			<footer className="flex items-center gap-3 pt-2 text-sm">
				<Link
					className="min-h-11 rounded border px-3 py-2"
					data-testid="open-map"
					to={`/g/${session.code}/map`}
				>
					Map
				</Link>
				{/* Building the board is a host act, and the builder is reachable
				    only from here — the map is the playing surface. m4-spec §9. */}
				{amHost && (
					<Link
						className="min-h-11 rounded border px-3 py-2"
						data-testid="open-builder"
						to={`/g/${session.code}/build`}
					>
						Game area
					</Link>
				)}
				<Link
					className="rounded border px-3 py-2"
					data-testid="open-debug"
					to={`/g/${session.code}/debug`}
				>
					Debug harness
				</Link>
				<button
					className="ml-auto min-h-11 rounded border px-3"
					data-testid="leave-game"
					disabled={leaving}
					onClick={leave}
					type="button"
				>
					{leaving ? "Leaving…" : "Leave game"}
				</button>
			</footer>
		</main>
	);
}

function toLobbyPlayer(player: {
	id: string;
	displayName: string;
	isHost: boolean;
}): LobbyPlayer {
	return {
		id: player.id,
		displayName: player.displayName,
		isHost: player.isHost,
	};
}
