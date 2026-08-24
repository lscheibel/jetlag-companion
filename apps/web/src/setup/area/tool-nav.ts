import { useLocation, useNavigate } from "react-router";
import { useAreaEditor } from "./use-editor";

/**
 * C2 opens a tool with `?from=picker` so Back returns to "Where are you
 * playing?" rather than the editor home the host has not visited yet.
 * The editor's own tool strip omits that flag, so Back is one level up.
 */
export function pickerToolPath(code: string, tool: string): string {
	return `/g/${code}/setup/area/edit/${tool}?from=picker`;
}

export function editorHomePath(code: string, from?: "lobby"): string {
	return from === "lobby"
		? `/g/${code}/setup/area/edit?from=lobby`
		: `/g/${code}/setup/area/edit`;
}

export function editorToolPath(code: string, tool: string): string {
	return `/g/${code}/setup/area/edit/${tool}`;
}

export function useAreaToolNav() {
	const navigate = useNavigate();
	const location = useLocation();
	const editor = useAreaEditor();
	const fromPicker =
		new URLSearchParams(location.search).get("from") === "picker";
	const picker = `/g/${editor.code}/setup/area`;
	const home = `/g/${editor.code}/setup/area/edit`;

	return {
		fromPicker,
		back: () => {
			if (fromPicker) void navigate(picker);
			else void navigate(-1);
		},
		afterCommit: () => {
			if (fromPicker) void navigate(home, { replace: true });
			else void navigate(-1);
		},
	};
}
