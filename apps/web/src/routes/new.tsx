import { useNavigate } from "react-router";
import { createGame } from "../api";
import { saveSession } from "../session";
import { NameStep } from "../setup/name-step";

/**
 * Opening a game, which starts with saying who is opening it.
 *
 * The first of five: name, area, transit, size, review. The rail is full-length from
 * here so the length of what you have agreed to is visible before you start.
 *
 * The game is created on this screen rather than at the end, because every
 * screen after it needs a token: the stop catalog is read with one, and the
 * counts the area and transit steps are built on come off the board this
 * creation hands back. Nothing the rest of the flow decides is written until
 * the review.
 */
export default function CreateGameRoute() {
	const navigate = useNavigate();

	return (
		<NameStep
			errorTestId="create-error"
			hint="You'll be running this game. You can hand that over to somebody else at any point."
			onBack={() => void navigate("/")}
			onSubmit={async (displayName) => {
				const session = await createGame(displayName);
				saveSession(session);
				await navigate(`/g/${session.code}/setup/area`);
			}}
			steps={{ count: 5, current: 0, label: "Create game" }}
			submitLabel="Continue"
			submitTestId="create-confirm"
			title="What should we call you?"
		/>
	);
}
