import { useNavigate } from "react-router";
import { createGame } from "../api";
import { saveSession } from "../session";
import { NameStep } from "../setup/name-step";
import { SETUP_STEPS } from "../setup/wizard-step";

/**
 * Opening a game, which starts with saying who is opening it.
 *
 * The first of six: name, area, transit, size, teams, review. The rail is
 * full-length from here so the length of what you have agreed to is visible
 * before you start.
 *
 * The game is created on this screen rather than at the end, because every
 * screen after it needs a token: the stop catalog is read with one, and the
 * counts the area and transit steps are built on come off the board this
 * creation hands back. The board (transit, size) is written at review; teams
 * are live as soon as they are made.
 */
export default function CreateGameRoute() {
	const navigate = useNavigate();

	return (
		<NameStep
			disclaimer={
				<>
					This companion does not replace the physical game. You still need{" "}
					<a
						className="underline decoration-hairline-strong underline-offset-2 hover:text-ink"
						href="https://store.nebula.tv/collections/jetlag"
						rel="noreferrer"
						target="_blank"
					>
						a copy of Hide + Seek
					</a>{" "}
					to play.
				</>
			}
			errorTestId="create-error"
			hint="You'll be running this game. You can hand that over to somebody else at any point."
			onBack={() => void navigate("/")}
			onSubmit={async (displayName) => {
				const session = await createGame(displayName);
				saveSession(session);
				await navigate(`/g/${session.code}/setup/area`);
			}}
			pledge="I solemnly swear that I own a copy of the game."
			steps={{ count: SETUP_STEPS, current: 0, label: "Create game" }}
			submitLabel="Continue"
			submitTestId="create-confirm"
			title="What should we call you?"
		/>
	);
}
