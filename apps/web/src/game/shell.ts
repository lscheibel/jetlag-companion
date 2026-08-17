import { useOutletContext } from "react-router";
import type { EphemeralChannel, EphemeralState } from "../ephemeral";
import type { Session } from "../session";

/**
 * What every screen inside a game gets from the route that owns the session.
 *
 * The Zero client and the ephemeral socket are set up once, in the `/g/:code`
 * layout, and the lobby and the debug harness are both children of it. Two
 * screens in one game are one connection, not two.
 */
export interface GameShell {
	readonly session: Session;
	readonly channel: EphemeralChannel | null;
	readonly ephemeral: EphemeralState;
	/**
	 * Null only until the first sync lands. The layout subscribes to it for
	 * every screen because **every mutator reads it**: `appendEvent` allocates
	 * `seq` from `game.eventSeq`, so a screen that can write without the game row
	 * in its store is a screen whose optimistic writes all refuse themselves.
	 */
	readonly positionIntervalMs: number;
}

export function useGameShell(): GameShell {
	return useOutletContext<GameShell>();
}
