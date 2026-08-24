import { multiPolygonBBox } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useLocation, useNavigate } from "react-router";
import { formatArea } from "../builder/use-builder";
import { MapFitSelection, MapFlyTo } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { GERMANY_BOUNDS } from "../setup/area/labels";
import { FoldLayer, FoldStopsLayer } from "../setup/area/layers";
import { PieceRow } from "../setup/area/piece-row";
import { ToolStrip } from "../setup/area/tool-strip";
import { useAreaEditor } from "../setup/area/use-editor";

/**
 * The area editor home: one map, every tool, the last pieces, and a single
 * action that leaves edit mode — the pieces themselves are already the draft.
 */
export default function SetupAreaEditor() {
	const navigate = useNavigate();
	const location = useLocation();
	const editor = useAreaEditor();
	const foldBounds = multiPolygonBBox(editor.foldMulti);
	const bounds = foldBounds ?? GERMANY_BOUNDS;
	const recent = editor.pieces.slice(-2).reverse();
	const fromLobby =
		new URLSearchParams(location.search).get("from") === "lobby";
	const afterLeave = fromLobby
		? `/g/${editor.code}`
		: `/g/${editor.code}/setup/area`;

	function leave() {
		if (fromLobby && editor.dirty) editor.applyArea(afterLeave);
		else void navigate(afterLeave);
	}

	return (
		<Screen data-testid="area-editor">
			<ScreenHeader
				eyebrow={fromLobby ? "This game" : "Step 2 of 5"}
				onBack={leave}
				title="Set up the area"
				trailing={
					<span className="rounded-full bg-action px-2.5 py-1 font-bold font-mono text-[0.6rem] text-action-ink uppercase tracking-[0.08em]">
						{editor.pieces.length}{" "}
						{editor.pieces.length === 1 ? "piece" : "pieces"}
					</span>
				}
			/>
			<EditorMap bounds={bounds} className="mx-[-1rem] min-h-0 flex-1">
				<FoldLayer area={editor.foldMulti} />
				<FoldStopsLayer stops={editor.insideStops} />
				<MapFlyTo
					target={foldBounds ? { kind: "bounds", bounds: foldBounds } : null}
				/>
				<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-end px-7">
					<div className="pointer-events-auto">
						<MapFitSelection bounds={editor.empty ? null : bounds} />
					</div>
				</div>
				<div className="pointer-events-none absolute bottom-4 left-7 z-20 rounded-[14px] border border-hairline bg-surface/90 px-3 py-2 backdrop-blur">
					<div className="eyebrow">In play</div>
					<div className="num text-base" data-testid="area-editor-readout">
						{formatArea(editor.squareMeters)} · {editor.stopsInside} stops
					</div>
				</div>
			</EditorMap>
			<div className="flex shrink-0 flex-col gap-2.5 px-4 pt-3">
				<ToolStrip />
				<div className="flex items-center justify-between px-0.5">
					<span className="eyebrow">
						{editor.pieces.length}{" "}
						{editor.pieces.length === 1 ? "piece" : "pieces"}
					</span>
					<button
						className="eyebrow text-ink-dim"
						data-testid="area-show-pieces"
						onClick={() =>
							void navigate(`/g/${editor.code}/setup/area/edit/pieces`)
						}
						type="button"
					>
						Show all ›
					</button>
				</div>
				{recent.map((piece) => (
					<PieceRow compact key={piece.id} piece={piece} />
				))}
			</div>
			<ScreenActions
				note={
					editor.problem ? (
						<span className="text-danger">{editor.problem}</span>
					) : undefined
				}
			>
				<ActionButton
					beacon
					data-testid="area-use"
					disabled={editor.empty || editor.busy || !editor.ready}
					onClick={() => editor.applyArea(afterLeave)}
				>
					{editor.busy ? "Saving…" : "Use this area"}
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
