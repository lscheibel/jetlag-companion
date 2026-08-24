import { cn } from "@zero-lag/ui/lib/utils";
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
			<div className="grid grid-cols-2 gap-1 rounded-[15px] border border-hairline bg-surface p-1">
				<button
					className={cn(
						"min-h-11 rounded-[11px] font-mono text-[0.65rem] uppercase tracking-[0.08em]",
						editor.cut ? "text-ink-dim" : "bg-live/20 font-bold text-live",
					)}
					data-testid="area-tool-add"
					onClick={() => editor.setCut(false)}
					type="button"
				>
					+ Add
				</button>
				<button
					className={cn(
						"min-h-11 rounded-[11px] font-mono text-[0.65rem] uppercase tracking-[0.08em]",
						editor.cut || current === "cut"
							? "bg-danger/20 font-bold text-danger"
							: "text-ink-dim",
					)}
					data-testid="area-tool-cut"
					onClick={() => editor.setCut(true)}
					type="button"
				>
					⊖ Take out
				</button>
			</div>
			<div className="flex gap-1.5">
				{TOOLS.map((tool) => {
					const on = current === tool.id;
					return (
						<button
							className={cn(
								"flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[15px] border px-1 py-2",
								"font-mono text-[0.55rem] uppercase tracking-[0.05em]",
								on
									? "border-action bg-action font-bold text-action-ink"
									: "border-hairline bg-surface text-ink-dim",
							)}
							data-testid={`area-tool-${tool.id}`}
							key={tool.id}
							onClick={() =>
								void navigate(editorToolPath(editor.code, tool.id))
							}
							type="button"
						>
							<span className="text-lg leading-none">{tool.glyph}</span>
							{tool.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
