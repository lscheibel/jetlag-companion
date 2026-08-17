import type {
	BatteryState,
	PositionSnapshot,
	TeamRole,
} from "@zero-lag/schema";
import type { PresenceEntry } from "../ephemeral";
import type { TeamIdentity } from "../lobby/team-badge";
import { ageOf, type Staleness } from "./staleness";

/**
 * One marker's worth of truth, assembled from the two sources that are allowed
 * to contribute to it. m2-spec §4.
 *
 * The roster is Zero's and presence is left-joined onto it, never the other way
 * round. A player with no presence entry is rendered as offline rather than
 * omitted, which is the only way "a phone in airplane mode goes visibly stale
 * instead of silently wrong" can be true — and it also survives a page reload,
 * when the socket is new and Zero's store is not.
 */
export interface MapPlayer {
	readonly playerId: string;
	readonly displayName: string;
	readonly teamId: string | null;
	readonly team: TeamIdentity | null;
	readonly role: TeamRole | null;
	readonly fix: PositionSnapshot | null;
	readonly ageMs: number | null;
	readonly staleness: Staleness;
	readonly online: boolean;
	readonly battery: BatteryState | null;
	readonly isSelf: boolean;
}

export interface RosterPlayer {
	readonly id: string;
	readonly displayName: string;
	readonly leftAt: number | null;
}

export interface RosterTeam {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly emoji: string;
	readonly members: readonly { readonly playerId: string }[];
}

export interface BuildMapPlayersInput {
	readonly players: readonly RosterPlayer[];
	readonly teams: readonly RosterTeam[];
	readonly entries: readonly PresenceEntry[];
	readonly entriesArrivedAt: number;
	readonly now: number;
	readonly selfPlayerId: string;
}

export function buildMapPlayers({
	players,
	teams,
	entries,
	entriesArrivedAt,
	now,
	selfPlayerId,
}: BuildMapPlayersInput): MapPlayer[] {
	const presence = new Map(entries.map((entry) => [entry.playerId, entry]));

	const teamOf = new Map<string, RosterTeam>();
	for (const team of teams) {
		for (const member of team.members) teamOf.set(member.playerId, team);
	}

	return (
		players
			/**
			 * A marker is a claim that somebody is out there. Players who have left
			 * or been removed are not in the game, however recently they were seen.
			 */
			.filter((player) => player.leftAt === null)
			.map((player) => {
				const entry = presence.get(player.id);
				const team = teamOf.get(player.id) ?? null;
				const { ageMs, staleness } = ageOf(
					entry?.fixAgeMs ?? null,
					entriesArrivedAt,
					now,
				);

				return {
					playerId: player.id,
					displayName: player.displayName,
					teamId: team?.id ?? null,
					team: team
						? { name: team.name, color: team.color, emoji: team.emoji }
						: null,
					role: entry?.role ?? null,
					fix: entry?.fix ?? null,
					ageMs,
					staleness,
					// No entry at all is a player who has never opened the game, which
					// is a different thing from one who has and gone quiet.
					online: entry?.online ?? false,
					battery: entry?.battery ?? null,
					isSelf: player.id === selfPlayerId,
				} satisfies MapPlayer;
			})
	);
}

/**
 * What the hider's blindness switch actually does. m2-spec §9.
 *
 * Other teams' markers go; their own team's stay, because three hiders
 * coordinating still need each other — what they want to stop seeing is the
 * search closing in. Nothing else changes: presence keeps arriving, the channel
 * keeps sending, the log keeps recording. It is a rendering switch.
 */
export function visibleMarkers(
	players: readonly MapPlayer[],
	blind: boolean,
	ownTeamId: string | null,
): MapPlayer[] {
	if (!blind) return [...players];
	return players.filter(
		(player) =>
			player.isSelf || (ownTeamId !== null && player.teamId === ownTeamId),
	);
}
