import { useQuery } from "@rocicorp/zero/react";
import { queries, type TeamRole } from "@zero-lag/schema";
import { useMemo } from "react";
import { useGameShell } from "../game/shell";
import type { LobbyPerson, LobbyTeamView } from "./model";

/**
 * The lobby, derived once.
 *
 * The board, the player sheet and the ready check all read the same thing —
 * and three separate versions of "who is on which team" is how two of them
 * end up disagreeing about whether a game can start.
 */

export interface LobbyRound {
	readonly id: string;
	readonly status: string;
	readonly hidingDurationMs: number;
}

export interface LobbyView {
	readonly people: readonly LobbyPerson[];
	readonly teams: readonly LobbyTeamView[];
	readonly unassigned: readonly LobbyPerson[];
	readonly removed: readonly LobbyPerson[];
	readonly offline: readonly LobbyPerson[];
	readonly me: LobbyPerson | null;
	readonly myTeam: LobbyTeamView | null;
	readonly amHost: boolean;
	readonly nobodyIsHost: boolean;
	readonly round: LobbyRound | null;
	readonly gameName: string;
}

export function useLobby(): LobbyView {
	const { session, ephemeral } = useGameShell();
	const [games] = useQuery(queries.game());
	const [players] = useQuery(queries.players());
	const [teams] = useQuery(queries.teams());
	const [rounds] = useQuery(queries.rounds());

	const presence = useMemo(() => {
		const map = new Map<string, (typeof ephemeral.entries)[number]>();
		for (const entry of ephemeral.entries) {
			map.set(entry.playerId, entry);
		}
		return map;
	}, [ephemeral.entries]);

	return useMemo(() => {
		/**
		 * The live round is the highest-ordinal one that has not ended, and
		 * `pending` is not ended. There is always exactly one, because round 1 is
		 * created with the game. m1-spec §3.
		 */
		const round = [...rounds]
			.reverse()
			.find((value) => value.status !== "ended");
		const roleByTeamId = new Map<string, TeamRole>();
		for (const role of round?.roles ?? [])
			roleByTeamId.set(role.teamId, role.role);

		const teamIdByPlayerId = new Map<string, string>();
		for (const team of teams) {
			for (const member of team.members) {
				if (member.player && member.player.leftAt === null) {
					teamIdByPlayerId.set(member.player.id, team.id);
				}
			}
		}

		const toPerson = (player: {
			id: string;
			displayName: string;
			isHost: boolean;
			readyAt?: number | null;
		}): LobbyPerson => {
			const entry = presence.get(player.id);
			return {
				id: player.id,
				displayName: player.displayName,
				isHost: player.isHost,
				readyAt: player.readyAt ?? null,
				teamId: teamIdByPlayerId.get(player.id) ?? null,
				online: entry?.online ?? false,
				lastSeenAgeMs:
					entry == null ? null : entry.online ? 0 : (entry.lastSeenAgeMs ?? 0),
			};
		};

		const people = players
			.filter((player) => player.leftAt === null)
			.map(toPerson);

		const teamViews: LobbyTeamView[] = teams.map((team) => ({
			id: team.id,
			name: team.name,
			color: team.color,
			emoji: team.emoji,
			role: roleByTeamId.get(team.id) ?? null,
			members: people.filter((person) => person.teamId === team.id),
		}));

		const me = people.find((person) => person.id === session.playerId) ?? null;

		return {
			people,
			teams: teamViews,
			unassigned: people.filter((person) => person.teamId === null),
			removed: players
				.filter((player) => player.removedByPlayerId !== null)
				.map(toPerson),
			offline: people.filter((person) => !person.online),
			me,
			myTeam:
				teamViews.find((team) => team.id === (me?.teamId ?? null)) ?? null,
			amHost: me?.isHost ?? false,
			nobodyIsHost:
				people.length > 0 && people.every((person) => !person.isHost),
			round: round
				? {
						id: round.id,
						status: round.status,
						hidingDurationMs: round.hidingDurationMs,
					}
				: null,
			gameName: games[0]?.mapConfig?.name ?? "This game",
		};
	}, [games, players, teams, rounds, presence, session.playerId]);
}
