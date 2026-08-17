import { Link } from "react-router";
import { Constraints } from "../game/constraints";
import { Hiding } from "../game/hiding";
import { Panel } from "../game/panel";
import { Presence } from "../game/presence";
import { Questions } from "../game/questions";
import { Roster } from "../game/roster";
import { Rounds } from "../game/rounds";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";

/**
 * The M0 debug harness. Not a game: one panel per contract in the spec, and
 * enough affordances to drive the acceptance tests. Retained per m0-spec
 * decision 4, and moved under the game's own URL by m1-spec §8.
 */
export default function DebugRoute() {
	const { session, ephemeral, tracking } = useGameShell();
	const role = useMyRole(session.playerId);
	// The watch and the queue belong to the session, not to this screen —
	// m2-spec §10, and two of them over one `localStorage` key is one queue
	// counted twice.
	const { queueSize, lastFix, sample } = tracking;

	return (
		<main className="mx-auto max-w-2xl space-y-3 p-4">
			<header className="flex items-center gap-3">
				<h1 className="font-semibold" data-testid="game-code">
					{session.code}
				</h1>
				<span data-testid="my-role">{role.role ?? "no role"}</span>
				<Link
					className="ml-auto rounded border px-2 text-xs"
					data-testid="back-to-lobby"
					to={`/g/${session.code}`}
				>
					Lobby
				</Link>
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
