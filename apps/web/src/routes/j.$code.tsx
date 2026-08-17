import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { JoinError, joinFailureMessage, joinGame } from "../api";
import { loadSession, saveSession } from "../session";
import type { Route } from "./+types/j.$code";

/**
 * What a shared link and a scanned QR both land on: the code is already known,
 * so the only question left is what to call yourself. m1-spec §8.
 */
export default function JoinByLink({ params }: Route.ComponentProps) {
	const navigate = useNavigate();
	const code = params.code.toUpperCase();
	const [displayName, setDisplayName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// Already in this game on this device — a link you sent yourself, or a
	// second tap on the same one. Straight through.
	const known = loadSession()?.code === code;
	useEffect(() => {
		if (known) void navigate(`/g/${code}`, { replace: true });
	}, [known, code, navigate]);

	function onJoin(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		void (async () => {
			try {
				saveSession(await joinGame(code, displayName));
				await navigate(`/g/${code}`);
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

	return (
		<main className="mx-auto max-w-md space-y-6 p-6">
			<h1 className="font-semibold text-xl">Join game</h1>
			<p className="text-center font-mono text-3xl tracking-widest">{code}</p>

			<form className="space-y-3" onSubmit={onJoin}>
				<label className="block space-y-1">
					<span className="text-sm">Your name</span>
					<input
						autoComplete="nickname"
						className="min-h-11 w-full rounded border p-2"
						data-testid="display-name"
						onChange={(event) => setDisplayName(event.target.value)}
						value={displayName}
					/>
				</label>
				<button
					className="min-h-11 w-full rounded border p-2"
					data-testid="join-game"
					disabled={busy || displayName.length === 0}
					type="submit"
				>
					Join
				</button>
			</form>

			{error && (
				<p className="text-red-600 text-sm" data-testid="join-error">
					{error}
				</p>
			)}
		</main>
	);
}
