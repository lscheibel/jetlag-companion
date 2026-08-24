import { multiPolygonBBox } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Door } from "@zero-lag/ui/components/door";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { EditorMap } from "../setup/area/editor-map";
import { FoldLayer, FoldStopsLayer } from "../setup/area/layers";
import { editorHomePath, pickerToolPath } from "../setup/area/tool-nav";
import { useAreaEditor } from "../setup/area/use-editor";
import { formatGround } from "../setup/game-size";
import { WizardStep } from "../setup/wizard-step";

export default function SetupArea() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const editor = useAreaEditor();
	const picked = !editor.empty && editor.ready;
	const previewBounds = multiPolygonBBox(editor.foldMulti);
	const edit = (tool: "districts" | "draw" | "file") =>
		void navigate(pickerToolPath(session.code, tool));
	const openEditor = () => void navigate(editorHomePath(session.code));

	function continueSetup() {
		const next = `/g/${session.code}/setup/transit`;
		if (editor.dirty) editor.applyArea(next);
		else void navigate(next);
	}

	return (
		<WizardStep
			bodyClassName={picked ? "overflow-hidden pb-0" : undefined}
			continueDisabled={!picked || editor.busy}
			continueTestId="setup-area-continue"
			note={
				editor.problem ? (
					<span className="text-danger">{editor.problem}</span>
				) : picked ? undefined : (
					"Pick a place, a shape, or a file. Nothing is set until you do."
				)
			}
			onBack={() => void navigate("/")}
			onContinue={continueSetup}
			step={1}
			title="Where are you playing?"
		>
			{picked ? (
				<div
					className="flex min-h-0 flex-1 flex-col gap-3"
					data-testid="setup-area-chosen"
				>
					<button
						className="relative min-h-0 flex-1 overflow-hidden rounded-[18px]"
						onClick={openEditor}
						type="button"
					>
						<EditorMap
							bounds={previewBounds}
							className="pointer-events-none absolute inset-0"
							fitPadding={24}
						>
							<FoldLayer area={editor.foldMulti} />
							<FoldStopsLayer stops={editor.insideStops} />
						</EditorMap>
					</button>
					<div className="flex shrink-0 items-end justify-between gap-3 px-0.5">
						<div className="min-w-0">
							<b className="block font-semibold text-[0.95rem] leading-tight">
								{editor.name}
							</b>
							<p className="mt-1 text-ink-dim text-xs leading-snug">
								{`${formatGround(editor.squareMeters / 1e6)} · ${editor.stopsInside.toLocaleString("en")} stops`}
							</p>
						</div>
						<ActionButton
							className="w-auto shrink-0 px-5"
							data-testid="setup-area-edit"
							inline
							onClick={openEditor}
							size="compact"
							tone="secondary"
						>
							Edit
						</ActionButton>
					</div>
				</div>
			) : (
				<>
					<p className="eyebrow px-0.5" data-testid="setup-area-start-with">
						Start with
					</p>
					<Door
						chevron
						data-testid="setup-area-district"
						glyph="▨"
						hint="A Land, a district, or an Ortsteil anywhere in Germany"
						onClick={() => edit("districts")}
					>
						A place
					</Door>
					<Door
						chevron
						data-testid="setup-area-draw"
						glyph="✎"
						hint="Trace the edge on the map"
						onClick={() => edit("draw")}
					>
						A shape you draw
					</Door>
					<Door
						chevron
						data-testid="setup-area-file"
						glyph="⇪"
						hint="Files from Google My Maps, Komoot and the like"
						onClick={() => edit("file")}
					>
						A saved map
					</Door>
				</>
			)}
		</WizardStep>
	);
}
