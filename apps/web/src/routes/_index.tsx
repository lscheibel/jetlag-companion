import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { createGame, joinGame } from "../api";
import { loadSession, saveSession } from "../session";

/**
 * Everything before a token exists. M0's guardrail is that the UI stops at what
 * the acceptance tests need, so this is a form and nothing else.
 */
export default function Landing() {
	const navigate = useNavigate();
	const existing = loadSession();
	const [displayName, setDisplayName] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function run(action: () => Promise<void>) {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	}

	function onCreate(event: FormEvent) {
		event.preventDefault();
		void run(async () => {
			saveSession(await createGame(displayName));
			await navigate("/game");
		});
	}

	function onJoin(event: FormEvent) {
		event.preventDefault();
		void run(async () => {
			saveSession(await joinGame(code, displayName));
			await navigate("/game");
		});
	}

	return (
		<main className="mx-auto max-w-md space-y-6 p-6">
			<h1 className="font-semibold text-xl">zero-lag — M0 harness</h1>

			{existing && (
				<button
					className="w-full rounded border p-2"
					data-testid="resume"
					onClick={() => void navigate("/game")}
					type="button"
				>
					Resume game {existing.code}
				</button>
			)}

			<label className="block space-y-1">
				<span className="text-sm">Display name</span>
				<input
					className="w-full rounded border p-2"
					data-testid="display-name"
					onChange={(event) => setDisplayName(event.target.value)}
					value={displayName}
				/>
			</label>

			<form className="space-y-2" onSubmit={onCreate}>
				<button
					className="w-full rounded border p-2"
					data-testid="create-game"
					disabled={busy || displayName.length === 0}
					type="submit"
				>
					Create a game
				</button>
			</form>

			<form className="space-y-2" onSubmit={onJoin}>
				<label className="block space-y-1">
					<span className="text-sm">Join code</span>
					<input
						className="w-full rounded border p-2 uppercase"
						data-testid="join-code"
						onChange={(event) => setCode(event.target.value.toUpperCase())}
						value={code}
					/>
				</label>
				<button
					className="w-full rounded border p-2"
					data-testid="join-game"
					disabled={busy || displayName.length === 0 || code.length === 0}
					type="submit"
				>
					Join
				</button>
			</form>

			{error && (
				<p className="text-red-600 text-sm" data-testid="landing-error">
					{error}
				</p>
			)}
		</main>
	);
}
