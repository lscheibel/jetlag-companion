import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Stepper } from "@zero-lag/ui/components/stepper";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { fetchGamePreview, type GamePreview, joinGame } from "../api";
import { saveSession } from "../session";
import { CodeField } from "../setup/code-field";
import { GamePreviewCard } from "../setup/game-preview-card";
import { JOIN_CODE_LENGTH, setupFailureMessage } from "../setup/join-code";
import { NameStep } from "../setup/name-step";
import { UnknownCode } from "../setup/unknown-code";
import type { Route } from "./+types/join";

/**
 * The quiet door: a code, then a name, in that order.
 *
 * Nobody types their name into a game that turns out not to exist, so the code
 * resolves first and says what it found. The two steps are two URLs — the
 * second is this route with `?code=` on it — so the phone's own back gesture
 * and the header's back control mean the same thing: one step up. m1-spec §8.
 */

type JoinState =
	| { step: "code" }
	| { step: "name"; code: string; preview: GamePreview }
	| { step: "unknown"; code: string; problem: string };

export async function clientLoader({
	request,
}: Route.ClientLoaderArgs): Promise<JoinState> {
	const code = new URL(request.url).searchParams.get("code");
	if (!code) return { step: "code" };

	const upper = code.toUpperCase();
	try {
		return {
			step: "name",
			code: upper,
			preview: await fetchGamePreview(upper),
		};
	} catch (cause) {
		// Only reachable by opening this URL directly: step one does not offer
		// Continue until the code has resolved.
		return {
			step: "unknown",
			code: upper,
			problem: setupFailureMessage(cause),
		};
	}
}

export default function Join({ loaderData }: Route.ComponentProps) {
	const navigate = useNavigate();

	switch (loaderData.step) {
		case "code":
			return <CodeStep />;
		case "unknown":
			return (
				<UnknownCode
					code={loaderData.code}
					onBack={() => void navigate("/")}
					onRetry={() => void navigate("/join", { replace: true })}
					problem={loaderData.problem}
				/>
			);
		case "name":
			return (
				<JoinNameStep code={loaderData.code} preview={loaderData.preview} />
			);
	}
}

/**
 * What the typed code has turned into so far. One value rather than a flag
 * each, because looking, found and missing are the same field being three
 * different things, and a screen that can be two of them at once is a screen
 * that eventually will be.
 */
type Lookup =
	| { state: "incomplete" }
	| { state: "looking"; code: string }
	| { state: "found"; code: string; preview: GamePreview }
	| { state: "missing"; code: string; problem: string };

function CodeStep() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const [lookup, setLookup] = useState<Lookup>({ state: "incomplete" });

	/**
	 * The lookup belongs to typing the last character rather than to a render
	 * pass: it is an event, and an effect watching the code would run again for
	 * every unrelated re-render of the screen.
	 */
	function onChange(next: string) {
		setCode(next);
		if (next.length < JOIN_CODE_LENGTH) {
			setLookup({ state: "incomplete" });
			return;
		}
		setLookup({ state: "looking", code: next });
		void (async () => {
			try {
				const preview = await fetchGamePreview(next);
				setLookup((current) =>
					current.state === "looking" && current.code === next
						? { state: "found", code: next, preview }
						: current,
				);
			} catch (cause) {
				setLookup((current) =>
					current.state === "looking" && current.code === next
						? {
								state: "missing",
								code: next,
								problem: setupFailureMessage(cause),
							}
						: current,
				);
			}
		})();
	}

	function onContinue(event: FormEvent) {
		event.preventDefault();
		if (lookup.state !== "found") return;
		void navigate(`/join?code=${lookup.code}`);
	}

	return (
		<Screen>
			<ScreenHeader onBack={() => void navigate("/")} title="Join a game" />
			<div className="px-4 pb-2.5">
				<Stepper count={2} current={0} label="Join game" />
			</div>

			{/* Body and action in one form, so the keyboard's own go key
			    continues: a submit button outside its form is not the form's
			    default button, and Enter does nothing. */}
			<form className="flex flex-1 flex-col" onSubmit={onContinue}>
				<ScreenBody>
					<CodeField
						label={`The ${JOIN_CODE_LENGTH} characters the host reads out`}
						onChange={onChange}
						problem={lookup.state === "missing" ? lookup.problem : undefined}
						value={code}
					/>

					{lookup.state === "found" && (
						<GamePreviewCard preview={lookup.preview} />
					)}
					{lookup.state === "looking" && (
						<p className="eyebrow px-1">Looking for that game…</p>
					)}
				</ScreenBody>

				<ScreenActions note="Sent a link or a QR code instead? Open it and skip this.">
					<ActionButton
						beacon
						data-testid="join-continue"
						disabled={lookup.state !== "found"}
						type="submit"
					>
						Continue
					</ActionButton>
				</ScreenActions>
			</form>
		</Screen>
	);
}

interface JoinNameStepProps {
	code: string;
	preview: GamePreview;
}

function JoinNameStep({ code, preview }: JoinNameStepProps) {
	const navigate = useNavigate();

	return (
		<NameStep
			errorTestId="join-error"
			eyebrow={`Joining ${code}`}
			hint="Everyone in the game sees this. You can change it whenever you like."
			onBack={() => void navigate("/join")}
			onSubmit={async (displayName) => {
				saveSession(await joinGame(code, displayName));
				await navigate(`/g/${code}`);
			}}
			steps={{ count: 2, current: 1, label: "Join game" }}
			submitLabel="Join game"
			submitTestId="join-game"
			title="What should we call you?"
		>
			<GamePreviewCard preview={preview} />
		</NameStep>
	);
}
