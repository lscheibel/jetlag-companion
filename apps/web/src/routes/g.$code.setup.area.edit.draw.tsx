import { buildValidHidingArea } from "@zero-lag/catalog";
import {
	type LngLat,
	multiPolygonBBox,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useState } from "react";
import { DrawLayer } from "../map/draw-layer";
import { MapPointerHandler } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { FoldLayer, PreviewLayer } from "../setup/area/layers";
import { useAreaToolNav } from "../setup/area/tool-nav";
import { useAreaEditor } from "../setup/area/use-editor";
import { WouldBecome } from "../setup/area/would-become";

export default function SetupAreaDraw() {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();
	const [ring, setRing] = useState<readonly LngLat[]>([]);
	const repaired = ring.length >= 3 ? buildValidHidingArea(ring) : null;
	const geometry = repaired ? regionToMultiPolygon(repaired) : null;
	const op = editor.cut ? "subtract" : "add";
	const bounds = multiPolygonBBox(editor.foldMulti);

	function commit() {
		if (!geometry) return;
		editor.addGeometry({
			source: "drawn",
			name: editor.cut ? "Drawn cut" : "Drawn by hand",
			geometry,
		});
		nav.afterCommit();
	}

	return (
		<Screen>
			<ScreenHeader
				eyebrow="Setting the area"
				onBack={nav.back}
				title={editor.cut ? "Draw what to take out" : "Trace the edge"}
			/>
			<EditorMap bounds={bounds} className="min-h-0 flex-1">
				<FoldLayer area={editor.foldMulti} />
				{geometry && <PreviewLayer geometry={geometry} op="add" />}
				<DrawLayer ring={ring} />
				<MapPointerHandler
					mode={{ kind: "ring", closed: true, points: ring }}
					onRingChange={(draft) => setRing(draft.points)}
				/>
			</EditorMap>
			<div className="flex items-center gap-2 px-4 pt-2">
				<p className="min-w-0 flex-1 text-ink-dim text-xs leading-snug">
					Tap corners. Tap an edge to insert one.
					<span className="sr-only" data-testid="draw-vertex-count">
						{ring.length}
					</span>
				</p>
				<button
					className="rounded-control border border-hairline px-3 py-2 text-sm"
					data-testid="area-draw-undo"
					disabled={ring.length === 0}
					onClick={() => setRing((current) => current.slice(0, -1))}
					type="button"
				>
					Undo
				</button>
			</div>
			<ScreenActions
				note={
					geometry ? (
						<WouldBecome geometry={geometry} op={op} />
					) : (
						"Three corners make a shape."
					)
				}
			>
				<ActionButton
					beacon
					data-testid="area-draw-add"
					disabled={!geometry || !editor.ready}
					onClick={commit}
				>
					{editor.cut ? "Take this out" : "Add this shape"}
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
