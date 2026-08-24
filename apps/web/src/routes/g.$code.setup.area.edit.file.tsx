import { type MultiPolygon, multiPolygonBBox } from "@zero-lag/geo";
import { useRef, useState } from "react";
import { MapFlyTo } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { EditorScreen } from "../setup/area/editor-screen";
import { parseAreaFile } from "../setup/area/import-file";
import { GERMANY_BOUNDS } from "../setup/area/labels";
import { FoldLayer, PreviewLayer } from "../setup/area/layers";
import { useAreaToolNav } from "../setup/area/tool-nav";
import { useAreaEditor } from "../setup/area/use-editor";
import { WouldBecome } from "../setup/area/would-become";

interface Draft {
	readonly name: string;
	readonly geometry: MultiPolygon;
}

export default function SetupAreaFile() {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();
	const input = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const op = editor.cut ? "subtract" : "add";
	const previewBounds = draft
		? multiPolygonBBox(draft.geometry)
		: (multiPolygonBBox(editor.foldMulti) ?? GERMANY_BOUNDS);
	const flyTo =
		draft && previewBounds
			? { kind: "bounds" as const, bounds: previewBounds }
			: null;

	function commit() {
		if (!draft) return;
		editor.addGeometry({
			source: "file",
			name: draft.name,
			geometry: draft.geometry,
		});
		nav.afterCommit();
	}

	function pick() {
		input.current?.click();
	}

	async function onFile(file: File) {
		setProblem(null);
		const text = await file.text();
		const parsed = parseAreaFile(file.name, text);
		if (!parsed.ok) {
			setDraft(null);
			setProblem(parsed.error);
			return;
		}
		setDraft({ name: parsed.name, geometry: parsed.geometry });
	}

	return (
		<EditorScreen
			actionDisabled={false}
			actionHint={
				draft ? <WouldBecome geometry={draft.geometry} op={op} /> : undefined
			}
			actionLabel={
				draft
					? editor.cut
						? `Take out ${draft.name}`
						: `Add ${draft.name}`
					: "Pick a file"
			}
			actionTestId={draft ? "area-file-add" : "area-file-pick"}
			bodyClassName="overflow-hidden"
			note={
				problem ? (
					<span className="text-danger">{problem}</span>
				) : draft ? undefined : (
					"GeoJSON, KML from Google My Maps, or a closed GPX track."
				)
			}
			onAction={draft ? commit : pick}
			secondary={
				draft
					? {
							label: "Pick a file",
							onClick: pick,
							testId: "area-file-pick",
						}
					: undefined
			}
			title={editor.cut ? "Take out from a file" : "A saved map"}
		>
			<EditorMap
				bounds={previewBounds ?? GERMANY_BOUNDS}
				className="min-h-0 flex-1 rounded-[18px] border border-hairline"
			>
				<FoldLayer area={editor.foldMulti} />
				{draft && <PreviewLayer geometry={draft.geometry} op={op} />}
				<MapFlyTo target={flyTo} />
			</EditorMap>
			<input
				accept=".geojson,.json,.kml,.gpx,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/gpx+xml"
				className="sr-only"
				data-testid="area-file-input"
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) void onFile(file);
				}}
				ref={input}
				type="file"
			/>
		</EditorScreen>
	);
}
