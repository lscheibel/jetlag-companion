import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { createGame, JoinError, joinFailureMessage, joinGame } from "../api";
import { loadSession, saveSession } from "../session";

/**
 * Everything before a token exists. Two doors: open a game, or type a code.
 * The third — somebody's link or QR — lands on `/j/:code` instead. m1-spec §8.
 */
export default function Landing() {
	const navigate = useNavigate();
	const [existing] = useState(loadSession);
	const [displayName, setDisplayName] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function run(open: () => Promise<{ code: string }>) {
		setBusy(true);
		setError(null);
		void (async () => {
			try {
				const session = await open();
				await navigate(`/g/${session.code}`);
			} catch (cause) {
				setError(
					cause instanceof JoinError
						? joinFailureMessage(cause.reason)
						: String(cause),
				);
			} finally {
				setBusy(false);
			}
		})();
	}

	function onCreate(event: FormEvent) {
		event.preventDefault();
		run(async () => {
			const session = await createGame(displayName);
			saveSession(session);
			return session;
		});
	}

	function onJoin(event: FormEvent) {
		event.preventDefault();
		run(async () => {
			const session = await joinGame(code.toUpperCase(), displayName);
			saveSession(session);
			return session;
		});
	}

	return (
		<main className="mx-auto max-w-md space-y-6 p-6">
			<h1 className="font-semibold text-xl">zero-lag</h1>

			{existing && (
				<button
					className="min-h-11 w-full rounded border p-2"
					data-testid="resume"
					onClick={() => void navigate(`/g/${existing.code}`)}
					type="button"
				>
					Resume game {existing.code}
				</button>
			)}

			<label className="block space-y-1">
				<span className="text-sm">Display name</span>
				<input
					className="min-h-11 w-full rounded border p-2"
					data-testid="display-name"
					onChange={(event) => setDisplayName(event.target.value)}
					value={displayName}
				/>
			</label>

			<form className="space-y-2" onSubmit={onCreate}>
				<button
					className="min-h-11 w-full rounded border p-2"
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
						className="min-h-11 w-full rounded border p-2 text-center font-mono text-2xl uppercase tracking-widest"
						data-testid="join-code"
						onChange={(event) => setCode(event.target.value.toUpperCase())}
						value={code}
					/>
				</label>
				<button
					className="min-h-11 w-full rounded border p-2"
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
