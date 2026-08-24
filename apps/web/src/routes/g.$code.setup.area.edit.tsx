import { Outlet } from "react-router";
import { useGameShell } from "../game/shell";

/**
 * Nested editor routes sit under this layout. They call `useGameShell`, so
 * the shell has to be handed down — a bare `<Outlet />` would leave them
 * without a session. Piece state lives one level up, on the area step.
 */
export default function SetupAreaEditLayout() {
	const shell = useGameShell();
	return <Outlet context={shell} />;
}
