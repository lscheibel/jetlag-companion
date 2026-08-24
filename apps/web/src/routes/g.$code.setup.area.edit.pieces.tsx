import { Surface } from "@zero-lag/ui/components/surface";
import { formatArea } from "../builder/use-builder";
import { EditorScreen } from "../setup/area/editor-screen";
import { PieceRow } from "../setup/area/piece-row";
import { useAreaToolNav } from "../setup/area/tool-nav";
import { useAreaEditor } from "../setup/area/use-editor";

export default function SetupAreaPieces() {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();

	return (
		<EditorScreen
			actionLabel="Done"
			actionTestId="area-pieces-done"
			note="Added and taken away in order."
			onAction={nav.afterCommit}
			title="The pieces"
		>
			{editor.pieces.map((piece, index) => (
				<PieceRow
					key={piece.id}
					onMoveDown={
						index < editor.pieces.length - 1
							? () => editor.movePiece(piece.id, 1)
							: undefined
					}
					onMoveUp={
						index > 0 ? () => editor.movePiece(piece.id, -1) : undefined
					}
					onRemove={() => editor.removePiece(piece.id)}
					onToggleOp={() =>
						editor.setPieceOp(piece.id, piece.op === "add" ? "subtract" : "add")
					}
					piece={piece}
				/>
			))}
			<div className="flex-1" />
			<Surface className="flex items-center justify-between px-3.5 py-2.5">
				<span className="eyebrow">Everything together</span>
				<span className="num text-base" data-testid="area-pieces-total">
					{formatArea(editor.squareMeters)}
				</span>
			</Surface>
		</EditorScreen>
	);
}
