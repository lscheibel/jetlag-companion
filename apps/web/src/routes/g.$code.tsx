import {
	useConnectionState,
	useQuery,
	ZeroProvider,
} from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import type { GameShell } from "../game/shell";
import { useEphemeralChannel } from "../game/use-ephemeral";
import { loadSession, type Session } from "../session";
import { zeroOptions } from "../zero/options";
import type { Route } from "./+types/g.$code";

/**
 * The session layout: one Zero client, one ephemeral socket, for every screen
 * inside a game. The lobby and the M0 debug harness are both children.
 */
export default function GameShellRoute({ params }: Route.ComponentProps) {
	const navigate = useNavigate();
	// Read once per mount rather than on every render. localStorage is an
	// external store, and this app has exactly one session slot.
	const [session] = useState(loadSession);
	const code = params.code.toUpperCase();
	const matches = session?.code === code;

	useEffect(() => {
		// No session for this code — which is what following somebody's link looks
		// like from the outside. The join screen knows what to do with that.
		if (!matches) void navigate(`/j/${code}`, { replace: true });
	}, [matches, code, navigate]);

	if (!session || !matches) return <p data-testid="no-session">Joining…</p>;
	return <GameSession session={session} />;
}

function GameSession({ session }: { session: Session }) {
	/**
	 * ZeroProvider tears down and rebuilds its client whenever its props change
	 * identity, and `context` is an object literal — so an unmemoized options
	 * object recreates Zero on every render and it never gets past `connecting`.
	 */
	const options = useMemo(() => zeroOptions(session), [session]);

	return (
		<ZeroProvider {...options}>
			<Connected session={session} />
		</ZeroProvider>
	);
}

function Connected({ session }: { session: Session }) {
	const connection = useConnectionState();
	const { channel, state } = useEphemeralChannel(session.token);
	/**
	 * Subscribed here rather than in whichever screen happens to want a field
	 * off it. Every mutator calls `appendEvent`, which allocates `seq` from
	 * `game.eventSeq` — so a screen that can write without the game row synced
	 * is a screen whose optimistic writes refuse themselves.
	 */
	const [games] = useQuery(queries.game());
	const positionIntervalMs = games[0]?.positionIntervalMs ?? 30_000;

	const shell: GameShell = useMemo(
		() => ({ session, channel, ephemeral: state, positionIntervalMs }),
		[session, channel, state, positionIntervalMs],
	);

	return (
		<>
			<p
				className="px-4 pt-3 text-right text-muted-foreground text-xs"
				data-testid="connection-state"
			>
				{connection.name}
			</p>
			<Outlet context={shell} />
		</>
	);
}
