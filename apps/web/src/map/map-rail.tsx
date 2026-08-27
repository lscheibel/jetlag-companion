import type { BBox } from "@zero-lag/geo";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { IconButton } from "@zero-lag/ui/components/icon-button";
import { type Camera, cameraLabel } from "./camera";
import { MapFitSelection } from "./map-interactions";
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
	/** Off during hiding: hiders only need locate, fit, and a station tap. */
	readonly playTools?: boolean;
	readonly poiPickerOpen?: boolean;
	readonly onPoiPicker?: () => void;
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
	playTools = true,
	poiPickerOpen = false,
	onPoiPicker,
}: MapHudProps) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-end px-3">
			<div
				className="pointer-events-auto flex flex-col items-end gap-1"
				data-testid="map-rail"
			>
				<MapFitSelection bounds={bounds} />
				<IconButton
					aria-label={hasFix ? cameraLabel(camera) : "How to get a GPS fix"}
					// The locate control wears a `?` until there is a fix: the one
					// thing on the map that says why it is not doing anything yet.
					badge={hasFix ? undefined : "?"}
					data-camera-mode={camera.mode}
					onClick={onCycleCamera}
					pressed={camera.mode !== "free"}
					testId="cycle-camera"
				>
					<Icon name="crosshair" size="sm" />
				</IconButton>
				{blindness && (
					<IconButton
						aria-label={
							blindness.blind ? "Show other teams" : "Hide other teams"
						}
						onClick={blindness.toggle}
						pressed={blindness.blind}
						testId="toggle-blindness"
					>
						<Icon name={blindness.blind ? "eye-slash" : "eye"} size="sm" />
					</IconButton>
				)}
				{onPoiPicker && (
					<IconButton
						aria-label="Points of interest"
						onClick={onPoiPicker}
						pressed={poiPickerOpen}
						testId="map-poi-layers"
					>
						<Icon name="map-trifold" size="sm" />
					</IconButton>
				)}
				{playTools && (
					<>
						<HudTool
							icon="magnifying-glass"
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
							icon="ruler"
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
							icon="map-pin"
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
					</>
				)}
			</div>
		</div>
	);
}

function HudTool({
	icon,
	label,
	on,
	onClick,
	testId,
}: {
	readonly icon: IconName;
	readonly label: string;
	readonly on: boolean;
	readonly onClick: () => void;
	readonly testId: string;
}) {
	return (
		<IconButton
			aria-label={label}
			onClick={onClick}
			pressed={on}
			testId={testId}
		>
			<Icon name={icon} size="sm" />
		</IconButton>
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
