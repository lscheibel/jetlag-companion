interface DrawPanelProps {
	readonly drawing: boolean;
	readonly vertexCount: number;
	readonly onToggleDrawing: () => void;
	readonly onUndo: () => void;
	readonly onClear: () => void;
}

/**
 * The draw tool's controls, and its tap-capture notice. m4-spec §9.
 *
 * m3-spec §9's rule carries over unchanged: **while drawing, a map tap belongs
 * to the tool, and the tool is named on screen with a cancel next to it.** A
 * map that silently swallows taps is a map somebody thinks is broken.
 */
export function DrawPanel(props: DrawPanelProps) {
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex items-center gap-2">
				<button
					className="min-h-11 flex-1 rounded border px-3"
					data-testid="draw-toggle"
					onClick={props.onToggleDrawing}
					type="button"
				>
					{props.drawing ? "Drawing — tap to stop" : "Draw the area"}
				</button>
				<button
					className="min-h-11 rounded border px-3"
					data-testid="draw-undo"
					disabled={props.vertexCount === 0}
					onClick={props.onUndo}
					type="button"
				>
					Undo
				</button>
				<button
					className="min-h-11 rounded border px-3"
					data-testid="draw-clear"
					disabled={props.vertexCount === 0}
					onClick={props.onClear}
					type="button"
				>
					Clear
				</button>
			</div>
			{props.drawing && (
				<p className="mt-2 text-xs" data-testid="draw-hint">
					Tap the map to add corners. Three or more make an area.
					<span data-testid="draw-vertex-count">{props.vertexCount}</span>
				</p>
			)}
		</section>
	);
}
