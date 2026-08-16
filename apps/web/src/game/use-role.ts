import { useQuery } from "@rocicorp/zero/react";
import type { RoundStatus, TeamRole } from "@zero-lag/schema";
import { queries } from "@zero-lag/schema";

export type MyRole = {
	readonly teamId: string | null;
	readonly teamName: string | null;
	readonly role: TeamRole | null;
	readonly roundId: string | null;
	readonly roundStatus: RoundStatus | null;
};

/**
 * `player → teamMember → team → roundTeamRole`, resolved at read time rather
 * than carried in a token. Swapping roles between rounds, or a player changing
 * teams in the lobby, takes effect on the next query. m0-spec §4.
 */
export function useMyRole(playerId: string): MyRole {
	const [teams] = useQuery(queries.teams());
	const [rounds] = useQuery(queries.rounds());

	const myTeam = teams.find((team) =>
		team.members.some((member) => member.playerId === playerId),
	);

	// The live round is the highest-ordinal one that has not ended; `rounds` is
	// already ordered by ordinal.
	const live = [...rounds].reverse().find((round) => round.status !== "ended");
	const assignment = live?.roles.find((role) => role.teamId === myTeam?.id);

	return {
		teamId: myTeam?.id ?? null,
		teamName: myTeam?.name ?? null,
		role: assignment?.role ?? null,
		roundId: live?.id ?? null,
		roundStatus: live?.status ?? null,
	};
}
