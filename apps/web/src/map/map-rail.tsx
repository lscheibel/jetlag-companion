import type { BBox } from "@zero-lag/geo";
import { type Camera, cameraLabel } from "./camera";
import { MapFitSelection, MapHudButton } from "./map-interactions";
import type { MapTool } from "./toolkit";

interface MapHudProps {
	readonly camera: Camera;
	readonly onCycleCamera: () => void;
	readonly hasFix: boolean;
	readonly blindness: { readonly blind: boolean; toggle(): void } | null;
	readonly bounds: BBox | null;
	readonly tool: MapTool;
	readonly onToolChange: (tool: MapTool) => void;
	readonly onCancel: () => void;
	readonly canEditConstraints: boolean;
	readonly constraintsOpen: boolean;
	readonly onConstraintsClick: () => void;
	/** Off during hiding: hiders only need locate, fit, and a station tap. */
	readonly playTools?: boolean;
}

function constraintToolOn(tool: MapTool): boolean {
	return (
		tool.kind === "pickingBoundaryConstraint" ||
		tool.kind === "drawingPolygonConstraint" ||
		tool.kind === "drawingRadiusConstraint" ||
		tool.kind === "listingConstraints"
	);
}

/**
 * Fit, locate, then the play tools — the same HUD chrome as the area editor's
 * fit control, stacked top-right.
 */
export function MapHud({
	camera,
	onCycleCamera,
	hasFix,
	blindness,
	bounds,
	tool,
	onToolChange,
	onCancel,
	canEditConstraints,
	constraintsOpen,
	onConstraintsClick,
	playTools = true,
}: MapHudProps) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-end px-3">
			<div
				className="pointer-events-auto flex flex-col items-center gap-1"
				data-testid="map-rail"
			>
				<MapFitSelection bounds={bounds} />
				<div className="relative">
					<MapHudButton
						ariaLabel={hasFix ? cameraLabel(camera) : "How to get a GPS fix"}
						cameraMode={camera.mode}
						onClick={onCycleCamera}
						pressed={camera.mode !== "free"}
						testId="cycle-camera"
					>
						<LocateIcon />
					</MapHudButton>
					{!hasFix && (
						<span
							aria-hidden
							className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-action font-bold font-mono text-[0.55rem] text-action-ink"
						>
							?
						</span>
					)}
				</div>
				{blindness && (
					<MapHudButton
						ariaLabel={
							blindness.blind ? "Show other teams" : "Hide other teams"
						}
						onClick={blindness.toggle}
						pressed={blindness.blind}
						testId="toggle-blindness"
					>
						<EyeIcon struck={blindness.blind} />
					</MapHudButton>
				)}
				{playTools && (
					<div className="mt-1 grid grid-cols-2 gap-1">
						<HudTool
							glyph="⌕"
							label="Search"
							on={tool.kind === "searching" || tool.kind === "placingZone"}
							onClick={() =>
								toggle(
									tool.kind === "searching",
									{ kind: "searching" },
									onToolChange,
									onCancel,
								)
							}
							testId="map-search-tool"
						/>
						<HudTool
							glyph="━"
							label="Measure"
							on={tool.kind === "measure"}
							onClick={() =>
								toggle(
									tool.kind === "measure",
									{ kind: "measure", measure: { kind: "path", points: [] } },
									onToolChange,
									onCancel,
								)
							}
							testId="map-measure-tool"
						/>
						<HudTool
							glyph="◉"
							label="Pin"
							on={tool.kind === "placingPin" || tool.kind === "editingPin"}
							onClick={() =>
								toggle(
									tool.kind === "placingPin" || tool.kind === "editingPin",
									{ kind: "placingPin" },
									onToolChange,
									onCancel,
								)
							}
							testId="map-pin-tool"
						/>
						{canEditConstraints && (
							<HudTool
								glyph="⬡"
								label="Constraints"
								on={constraintsOpen || constraintToolOn(tool)}
								onClick={onConstraintsClick}
								testId="constraints-tool"
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function HudTool({
	glyph,
	label,
	on,
	onClick,
	testId,
}: {
	readonly glyph: string;
	readonly label: string;
	readonly on: boolean;
	readonly onClick: () => void;
	readonly testId: string;
}) {
	return (
		<MapHudButton
			ariaLabel={label}
			onClick={onClick}
			pressed={on}
			testId={testId}
		>
			<span className="text-base leading-none">{glyph}</span>
		</MapHudButton>
	);
}

function toggle(
	alreadyOn: boolean,
	next: MapTool,
	onToolChange: (tool: MapTool) => void,
	onCancel: () => void,
): void {
	if (alreadyOn) onCancel();
	else onToolChange(next);
}

function LocateIcon() {
	return (
		<svg
			aria-hidden
			fill="none"
			height="19"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.9"
			viewBox="0 0 24 24"
			width="19"
		>
			<title>Locate</title>
			<circle cx="12" cy="12" r="6" />
			<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
		</svg>
	);
}

function EyeIcon({ struck }: { readonly struck: boolean }) {
	return (
		<svg
			aria-hidden
			fill="none"
			height="19"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.9"
			viewBox="0 0 24 24"
			width="19"
		>
			<title>Blindness</title>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
			<circle cx="12" cy="12" r="3" />
			{struck && <path d="M4 4l16 16" />}
		</svg>
	);
}
