import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import {
	ToggleButton,
	ToggleModePair,
	ToggleStrip,
} from "@zero-lag/ui/components/toggle-button";
import { useNavigate } from "react-router";
import { editorToolPath } from "./tool-nav";
import { useAreaEditor } from "./use-editor";

export type AreaTool = "districts" | "draw" | "circle" | "file";

const TOOLS: readonly { id: AreaTool; icon: IconName; label: string }[] = [
	{ id: "districts", icon: "map-pin-simple-area", label: "Place" },
	{ id: "draw", icon: "pencil-line", label: "Draw" },
	{ id: "circle", icon: "circle-dashed", label: "Circle" },
	{ id: "file", icon: "upload-simple", label: "File" },
];

interface ToolStripProps {
	current?: AreaTool | null;
}

/**
 * What draws the next piece. Add-vs-take-out lives on the tool itself, above
 * the commit, so choosing a tool is not also choosing a direction.
 */
export function ToolStrip({ current = null }: ToolStripProps) {
	const navigate = useNavigate();
	const editor = useAreaEditor();

	return (
		<ToggleStrip testId="area-tool-strip">
			{TOOLS.map((tool) => (
				<ToggleButton
					icon={<Icon name={tool.icon} size="sm" />}
					key={tool.id}
					onClick={() => void navigate(editorToolPath(editor.code, tool.id))}
					pressed={current === tool.id}
					testId={`area-tool-${tool.id}`}
				>
					{tool.label}
				</ToggleButton>
			))}
		</ToggleStrip>
	);
}

/**
 * Which way this tool's commit counts. Sits directly above the add/take-out
 * action so the decision is on the piece, not on the editor home.
 * Hidden until there is something to take out of — the first piece is always
 * an add.
 */
export function AddCutToggle() {
	const editor = useAreaEditor();
	if (editor.pieces.length === 0) return null;

	return (
		<ToggleModePair>
			<ToggleButton
				icon={<Icon name="plus" size="xs" />}
				onClick={() => editor.setCut(false)}
				pressed={!editor.cut}
				shape="bar"
				testId="area-tool-add"
				tone="add"
			>
				Add
			</ToggleButton>
			<ToggleButton
				icon={<Icon name="scissors" size="xs" />}
				onClick={() => editor.setCut(true)}
				pressed={editor.cut}
				shape="bar"
				testId="area-tool-cut"
				tone="cut"
			>
				Take out
			</ToggleButton>
		</ToggleModePair>
	);
}
