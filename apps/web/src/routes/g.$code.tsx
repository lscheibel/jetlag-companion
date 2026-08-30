import {
	useConnectionState,
	useQuery,
	ZeroProvider,
} from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import type { GameShell } from "../game/shell";
import { useBatteryBroadcast } from "../game/use-battery-broadcast";
import { useEphemeralChannel } from "../game/use-ephemeral";
import { usePositionTracking } from "../game/use-position-tracking";
import { useMyRole } from "../game/use-role";
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
	const positionIntervalMs = games[0]?.positionIntervalMs ?? 5_000;

	const role = useMyRole(session.playerId);
	const location = useLocation();

	/**
	 * The tracking gate, in one place. m2-spec §10.
	 *
	 * | Lobby, map closed              | no broadcast | no log |
	 * | Map open, round pending        | broadcast    | no log |
	 * | Round hiding/seeking, any screen | broadcast  | log    |
	 *
	 * Which screen is open is read off the pathname rather than reported upward
	 * by a child, because the route that owns the session already knows. The M0
	 * debug harness counts as a screen that is asking where everyone is — it has
	 * a presence panel — so it broadcasts on the same terms as the map.
	 */
	const onPositionScreen =
		location.pathname.endsWith("/map") || location.pathname.endsWith("/debug");
	const roundRunning =
		role.roundStatus === "hiding" || role.roundStatus === "seeking";

	const tracking = usePositionTracking({
		gameId: session.gameId,
		teamId: role.teamId,
		roundId: role.roundId,
		intervalMs: positionIntervalMs,
		channel,
		broadcast: onPositionScreen || roundRunning,
		logging: roundRunning,
	});

	// Battery is not position: it costs nothing to read and the lobby shows it,
	// so it is announced for the whole session rather than gated on a screen.
	useBatteryBroadcast(channel, positionIntervalMs);

	const shell: GameShell = useMemo(
		() => ({
			session,
			channel,
			ephemeral: state,
			positionIntervalMs,
			tracking,
		}),
		[session, channel, state, positionIntervalMs, tracking],
	);

	return (
		<>
			{/*
			 * The connection state is for tests and for a developer looking for it.
			 * A player has never needed to read the word "connecting" off their
			 * lobby, and the app is deliberately built to keep working while it says
			 * so — so it is announced rather than displayed. m0-spec §3.
			 */}
			<p className="sr-only" data-testid="connection-state">
				{connection.name}
			</p>
			<Outlet context={shell} />
		</>
	);
}
