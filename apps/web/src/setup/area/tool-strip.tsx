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
	current?: AreaTool | "cut" | null;
}

/**
 * Which way the next drawing counts, then what draws it. Two controls rather
 * than eight: add-vs-take-out is a mode that outlives the tool in hand.
 */
export function ToolStrip({ current = null }: ToolStripProps) {
	const navigate = useNavigate();
	const editor = useAreaEditor();
	const cutting = editor.cut || current === "cut";

	return (
		<div className="flex flex-col gap-1.5" data-testid="area-tool-strip">
			<ToggleModePair>
				<ToggleButton
					icon={<Icon name="plus" size="xs" />}
					onClick={() => editor.setCut(false)}
					pressed={!cutting}
					shape="bar"
					testId="area-tool-add"
					tone="add"
				>
					Add
				</ToggleButton>
				<ToggleButton
					icon={<Icon name="scissors" size="xs" />}
					onClick={() => editor.setCut(true)}
					pressed={cutting}
					shape="bar"
					testId="area-tool-cut"
					tone="cut"
				>
					Take out
				</ToggleButton>
			</ToggleModePair>
			<ToggleStrip>
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
		</div>
	);
}
