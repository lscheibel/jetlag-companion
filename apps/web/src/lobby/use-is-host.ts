import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";

/**
 * The host hat, read in one place for the same reason `TeamBadge` exists once.
 * m1-spec §6.
 *
 * A game may have several hosts, and it may have none — the last one steps down,
 * or their phone dies. Both are ordinary, and `HostBanner` is what a game with
 * none looks like.
 */
export function useHosts() {
	const [players] = useQuery(queries.players());
	return players.filter((player) => player.isHost && player.leftAt === null);
}

export function useIsHost(playerId: string): boolean {
	return useHosts().some((player) => player.id === playerId);
}
