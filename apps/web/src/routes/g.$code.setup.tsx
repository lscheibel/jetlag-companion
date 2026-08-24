import { Outlet } from "react-router";
import { useGameShell } from "../game/shell";
import { SetupProvider } from "../setup/wizard";

/**
 * The create-a-game wizard, inside the game it is configuring.
 *
 * It lives under `/g/:code` rather than beside `/new` because everything it
 * asks about needs the game to exist first: the stop catalog is read with the
 * game's token, and the counts on every screen come off the board the game
 * already has. The name step is the exception, and it is the one screen that
 * runs before there is a game to be inside.
 */
export default function SetupLayout() {
	const shell = useGameShell();

	return (
		<SetupProvider>
			<Outlet context={shell} />
		</SetupProvider>
	);
}
