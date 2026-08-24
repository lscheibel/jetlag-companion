import { useZero } from "@rocicorp/zero/react";
import { mutators, type TeamRole } from "@zero-lag/schema";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type LobbyRejection, useRejections } from "./use-rejections";

/**
 * Every write the lobby can make, in one place.
 *
 * Components ask for the action they want rather than assembling a mutation, so
 * `eventId` generation and refusal handling happen once instead of at fifteen
 * call sites. m1-spec §10: every one of these writes state rows *and* an event
 * row, in one transaction, on the other side of the wire.
 */
export interface LobbyActions {
	claimHost(): void;
	releaseHost(): void;
	/** Returns the id it minted, so a caller can act on the team it just made. */
	createTeam(input: { name: string; color: string; emoji: string }): string;
	updateTeam(
		teamId: string,
		changes: { name?: string; color?: string; emoji?: string },
	): void;
	deleteTeam(teamId: string): void;
	/** `playerId` moves somebody else, which is a host action. */
	joinTeam(teamId: string, playerId?: string): void;
	leaveTeam(teamId: string): void;
	renamePlayer(displayName: string, playerId?: string): void;
	/** Your own word, and nobody else's to give. m1-spec §11. */
	setReady(ready: boolean): void;
	removePlayer(playerId: string): void;
	readmitPlayer(playerId: string): void;
	assignRoles(
		roundId: string,
		roles: readonly { teamId: string; role: TeamRole }[],
	): void;
	/**
	 * Resolves once the server has it, and the caller waits before tearing the
	 * session down. Closing Zero with this write still in flight would settle it
	 * against a closed client — and "I left" is the one write whose whole point
	 * is that the others find out.
	 */
	leaveGame(): Promise<void>;
}

interface LobbyContextValue {
	readonly actions: LobbyActions;
	readonly rejection: LobbyRejection | null;
	dismiss(): void;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

export function LobbyProvider({ children }: { children: ReactNode }) {
	const zero = useZero();
	const { rejection, submit, dismiss } = useRejections();

	const value = useMemo<LobbyContextValue>(() => {
		const event = () => ({ eventId: crypto.randomUUID() });

		const actions: LobbyActions = {
			claimHost: () => submit(zero.mutate(mutators.game.claimHost(event()))),
			releaseHost: () =>
				submit(zero.mutate(mutators.game.releaseHost(event()))),
			createTeam: (input) => {
				const teamId = crypto.randomUUID();
				submit(
					zero.mutate(mutators.team.create({ ...event(), teamId, ...input })),
				);
				return teamId;
			},
			updateTeam: (teamId, changes) =>
				submit(
					zero.mutate(mutators.team.update({ ...event(), teamId, ...changes })),
				),
			deleteTeam: (teamId) =>
				submit(zero.mutate(mutators.team.delete({ ...event(), teamId }))),
			joinTeam: (teamId, playerId) =>
				submit(
					zero.mutate(mutators.team.join({ ...event(), teamId, playerId })),
				),
			leaveTeam: (teamId) =>
				submit(zero.mutate(mutators.team.leave({ ...event(), teamId }))),
			renamePlayer: (displayName, playerId) =>
				submit(
					zero.mutate(
						mutators.player.rename({ ...event(), displayName, playerId }),
					),
				),
			setReady: (ready) =>
				submit(zero.mutate(mutators.player.setReady({ ...event(), ready }))),
			removePlayer: (playerId) =>
				submit(zero.mutate(mutators.player.remove({ ...event(), playerId }))),
			readmitPlayer: (playerId) =>
				submit(zero.mutate(mutators.player.readmit({ ...event(), playerId }))),
			assignRoles: (roundId, roles) =>
				submit(
					zero.mutate(
						mutators.round.assignRoles({
							...event(),
							roundId,
							roles: [...roles],
						}),
					),
				),
			// Not routed through `submit`: a refusal notice on a screen we are
			// leaving would have nowhere to appear.
			leaveGame: async () => {
				await zero.mutate(mutators.player.leave(event())).server;
			},
		};

		return { actions, rejection, dismiss };
	}, [zero, submit, rejection, dismiss]);

	return (
		<LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>
	);
}

function useLobby(): LobbyContextValue {
	const value = useContext(LobbyContext);
	if (!value) throw new Error("useLobby outside a LobbyProvider");
	return value;
}

export function useLobbyActions(): LobbyActions {
	return useLobby().actions;
}

export function useLobbyRejection() {
	const { rejection, dismiss } = useLobby();
	return { rejection, dismiss };
}
