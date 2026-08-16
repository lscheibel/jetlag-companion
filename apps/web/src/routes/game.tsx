import {
	useConnectionState,
	useQuery,
	ZeroProvider,
} from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Constraints } from "../game/constraints";
import { Hiding } from "../game/hiding";
import { Panel } from "../game/panel";
import { Presence } from "../game/presence";
import { Questions } from "../game/questions";
import { Roster } from "../game/roster";
import { Rounds } from "../game/rounds";
import { useEphemeralChannel } from "../game/use-ephemeral";
import { usePositionTracking } from "../game/use-position-tracking";
import { useMyRole } from "../game/use-role";
import { clearSession, loadSession, type Session } from "../session";
import { zeroOptions } from "../zero/options";

/**
 * The M0 debug harness. Not a game: one panel per contract in the spec, and
 * enough affordances to drive the seven acceptance tests. If this grows a map
 * screen or a second question type, M0 has stopped being M0.
 */
export default function GameRoute() {
	const navigate = useNavigate();
	const [session, setSession] = useState<Session | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const loaded = loadSession();
		setSession(loaded);
		setReady(true);
		if (!loaded) void navigate("/");
	}, [navigate]);

	if (!ready) return <p>Loading…</p>;
	if (!session) return <p data-testid="no-session">No session.</p>;

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
			<Harness session={session} />
		</ZeroProvider>
	);
}

function Harness({ session }: { session: Session }) {
	const navigate = useNavigate();
	const connection = useConnectionState();
	const [games] = useQuery(queries.game());
	const role = useMyRole(session.playerId);

	const { channel, state: ephemeral } = useEphemeralChannel(session.token);

	const game = games[0];
	const { queueSize, lastFix, sample } = usePositionTracking({
		gameId: session.gameId,
		teamId: role.teamId,
		roundId: role.roundId,
		intervalMs: game?.positionIntervalMs ?? 30_000,
		channel,
	});

	return (
		<main className="mx-auto max-w-2xl space-y-3 p-4">
			<header className="flex items-center gap-3">
				<h1 className="font-semibold" data-testid="game-code">
					{session.code}
				</h1>
				<span data-testid="connection-state">{connection.name}</span>
				<span data-testid="my-role">{role.role ?? "no role"}</span>
				<button
					className="ml-auto rounded border px-2 text-xs"
					data-testid="leave-game"
					onClick={() => {
						clearSession();
						void navigate("/");
					}}
					type="button"
				>
					Leave
				</button>
			</header>

			<Roster myTeamId={role.teamId} playerId={session.playerId} />
			<Rounds />
			<Hiding role={role} />
			<Questions
				onSample={(reason) => void sample(reason)}
				playerId={session.playerId}
				role={role}
			/>
			<Constraints />
			<Presence
				lastCapturedAt={lastFix?.capturedAt ?? null}
				queueSize={queueSize}
				state={ephemeral}
			/>

			<Panel testId="debug" title="Debug">
				<button
					className="rounded border px-2 text-xs"
					data-testid="sample-position"
					onClick={() => void sample("interval")}
					type="button"
				>
					Sample position now
				</button>
			</Panel>
		</main>
	);
}
