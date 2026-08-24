import { redirect, useNavigate } from "react-router";
import { fetchGamePreview, type GamePreview, joinGame } from "../api";
import { loadSession, saveSession } from "../session";
import { GamePreviewCard } from "../setup/game-preview-card";
import { setupFailureMessage } from "../setup/join-code";
import { NameStep } from "../setup/name-step";
import { UnknownCode } from "../setup/unknown-code";
import type { Route } from "./+types/j.$code";

/**
 * What a shared link and a scanned QR both land on. The code is already known,
 * so the only question left is what to call yourself — one step, and no
 * progress rail, because arriving this way there is nothing to count. m1-spec §8.
 */

type LinkState =
	| { code: string; preview: GamePreview }
	| { code: string; preview: null; problem: string };

export async function clientLoader({
	params,
}: Route.ClientLoaderArgs): Promise<LinkState> {
	const code = params.code.toUpperCase();

	/**
	 * Already in this game on this device — a link you sent yourself, or a second
	 * tap on the same one. Straight through, before anything is asked.
	 */
	if (loadSession()?.code === code) throw redirect(`/g/${code}`);

	try {
		return { code, preview: await fetchGamePreview(code) };
	} catch (cause) {
		return { code, preview: null, problem: setupFailureMessage(cause) };
	}
}

export default function JoinByLink({ loaderData }: Route.ComponentProps) {
	const navigate = useNavigate();

	if (loaderData.preview === null) {
		return (
			<UnknownCode
				code={loaderData.code}
				onBack={() => void navigate("/")}
				onRetry={() => void navigate("/join")}
				problem={loaderData.problem}
			/>
		);
	}

	const { code, preview } = loaderData;

	return (
		<NameStep
			errorTestId="join-error"
			eyebrow={`Joining ${code}`}
			hint="Everyone in the game sees this. You can change it whenever you like."
			onBack={() => void navigate("/")}
			onSubmit={async (displayName) => {
				saveSession(await joinGame(code, displayName));
				await navigate(`/g/${code}`);
			}}
			submitLabel="Join game"
			submitTestId="join-game"
			title="What should we call you?"
		>
			<GamePreviewCard preview={preview} />
		</NameStep>
	);
}
