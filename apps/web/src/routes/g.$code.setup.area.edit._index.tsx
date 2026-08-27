import { multiPolygonBBox } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Chip } from "@zero-lag/ui/components/chip";
import {
	Screen,
	ScreenActions,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useLocation, useNavigate } from "react-router";
import { MapFitSelection } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { GERMANY_BOUNDS } from "../setup/area/labels";
import { FoldLayer } from "../setup/area/layers";
import { ToolStrip } from "../setup/area/tool-strip";
import { useAreaEditor } from "../setup/area/use-editor";
import { formatArea } from "../setup/game-size";

/**
 * The area editor home: one map, every tool, and a single action that leaves
 * edit mode — the pieces themselves are already the draft.
 */
export default function SetupAreaEditor() {
	const navigate = useNavigate();
	const location = useLocation();
	const editor = useAreaEditor();
	const foldBounds = multiPolygonBBox(editor.foldMulti);
	const bounds = foldBounds ?? GERMANY_BOUNDS;
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
					<Chip className="shrink-0 gap-3" data-testid="area-editor-readout">
						{formatArea(editor.squareMeters)}
						<span>
							{editor.stopsInside.toLocaleString("en")}{" "}
							{editor.stopsInside === 1 ? "stop" : "stops"}
						</span>
					</Chip>
				}
			/>
			<EditorMap bounds={bounds} className="mx-[-1rem] min-h-0 flex-1">
				<FoldLayer area={editor.foldMulti} />
				<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-end px-7">
					<div className="pointer-events-auto">
						<MapFitSelection bounds={editor.empty ? null : bounds} />
					</div>
				</div>
			</EditorMap>
			<div className="flex shrink-0 flex-col gap-2.5 px-4 pt-3">
				<ToolStrip />
				<ActionButton
					data-testid="area-show-pieces"
					onClick={() =>
						void navigate(`/g/${editor.code}/setup/area/edit/pieces`)
					}
					size="compact"
					tone="secondary"
				>
					Edit layers
				</ActionButton>
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
