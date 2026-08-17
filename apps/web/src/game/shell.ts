import { useOutletContext } from "react-router";
import type { EphemeralChannel, EphemeralState } from "../ephemeral";
import type { Session } from "../session";
import type { PositionTracking } from "./use-position-tracking";

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
	/**
	 * One watch, one queue, for the whole game session. m2-spec §10.
	 *
	 * It lives here rather than on a screen because its two gates disagree about
	 * where they come from: broadcasting follows the screen and logging follows
	 * the round, and a round runs whichever screen you happen to be looking at. A
	 * second `usePositionTracking` on a child route would also mean a second
	 * `PositionLog` over the same `localStorage` key, which is one queue counted
	 * twice.
	 */
	readonly tracking: PositionTracking;
}

export function useGameShell(): GameShell {
	return useOutletContext<GameShell>();
}
