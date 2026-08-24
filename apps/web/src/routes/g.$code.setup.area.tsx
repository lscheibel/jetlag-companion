import { Outlet } from "react-router";
import { useGameShell } from "../game/shell";
import { AreaEditorProvider } from "../setup/area/use-editor";

/**
 * Piece state lives for the whole area step — the editor, the picker, and
 * "Where are you playing?" — so Back never throws a draft away.
 */
export default function SetupAreaLayout() {
	const shell = useGameShell();
	return (
		<AreaEditorProvider>
			<Outlet context={shell} />
		</AreaEditorProvider>
	);
}
