import { cn } from "@zero-lag/ui/lib/utils";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { editorToolPath } from "./tool-nav";
import { useAreaEditor } from "./use-editor";

export type AreaTool = "districts" | "draw" | "circle" | "file";

const TOOLS: readonly { id: AreaTool; glyph: string; label: string }[] = [
	{ id: "districts", glyph: "▦", label: "Place" },
	{ id: "draw", glyph: "✎", label: "Draw" },
	{ id: "circle", glyph: "◎", label: "Circle" },
	{ id: "file", glyph: "⇪", label: "File" },
];

interface ToolStripProps {
	current?: AreaTool | "cut" | null;
}

export function ToolStrip({ current = null }: ToolStripProps) {
	const navigate = useNavigate();
	const editor = useAreaEditor();

	return (
		<div className="flex flex-col gap-1.5" data-testid="area-tool-strip">
			<ToolModePair
				left={{
					label: "+ Add",
					on: !editor.cut,
					onClick: () => editor.setCut(false),
					testId: "area-tool-add",
					tone: "add",
				}}
				right={{
					label: "⊖ Take out",
					on: editor.cut || current === "cut",
					onClick: () => editor.setCut(true),
					testId: "area-tool-cut",
					tone: "cut",
				}}
			/>
			<div className="flex gap-1.5">
				{TOOLS.map((tool) => (
					<ToolButton
						glyph={tool.glyph}
						key={tool.id}
						label={tool.label}
						on={current === tool.id}
						onClick={() => void navigate(editorToolPath(editor.code, tool.id))}
						testId={`area-tool-${tool.id}`}
					/>
				))}
			</div>
		</div>
	);
}

interface ToolButtonProps {
	readonly glyph: ReactNode;
	readonly label: string;
	readonly on: boolean;
	readonly onClick: () => void;
	readonly testId: string;
}

/** One cell in the editor (and play map) tool strip. */
export function ToolButton({
	glyph,
	label,
	on,
	onClick,
	testId,
}: ToolButtonProps) {
	return (
		<button
			aria-pressed={on}
			className={cn(
				"flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[15px] border px-1 py-2",
				"font-mono text-[0.55rem] uppercase tracking-[0.05em]",
				on
					? "border-action bg-action font-bold text-action-ink"
					: "border-hairline bg-surface text-ink-dim",
			)}
			data-testid={testId}
			onClick={onClick}
			type="button"
		>
			<span className="text-lg leading-none">{glyph}</span>
			{label}
		</button>
	);
}

interface ToolMode {
	readonly label: string;
	readonly on: boolean;
	readonly onClick: () => void;
	readonly testId: string;
	readonly tone: "add" | "cut" | "plain";
}

/** The two-up switch the editor uses for add vs take-out. */
export function ToolModePair({
	left,
	right,
}: {
	readonly left: ToolMode;
	readonly right: ToolMode;
}) {
	return (
		<div className="grid grid-cols-2 gap-1 rounded-[15px] border border-hairline bg-surface p-1">
			<ModeButton mode={left} />
			<ModeButton mode={right} />
		</div>
	);
}

function ModeButton({ mode }: { readonly mode: ToolMode }) {
	return (
		<button
			aria-pressed={mode.on}
			className={cn(
				"min-h-11 rounded-[11px] font-mono text-[0.65rem] uppercase tracking-[0.08em]",
				mode.on && mode.tone === "add" && "bg-live/20 font-bold text-live",
				mode.on && mode.tone === "cut" && "bg-danger/20 font-bold text-danger",
				mode.on &&
					mode.tone === "plain" &&
					"bg-action/20 font-bold text-action",
				!mode.on && "text-ink-dim",
			)}
			data-testid={mode.testId}
			onClick={mode.onClick}
			type="button"
		>
			{mode.label}
		</button>
	);
}
