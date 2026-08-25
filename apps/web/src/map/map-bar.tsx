import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { NumberStepper } from "@zero-lag/ui/components/number-stepper";
import { Surface } from "@zero-lag/ui/components/surface";
import { useState } from "react";
import { HiderChip, type HiderOption } from "../game/hider-selector";
import { ToolModePair } from "../setup/area/tool-strip";
import { formatZone, stepZoneMeters } from "../setup/game-size";
import type { MapTool } from "./toolkit";

export const COMPACT_SECONDARY =
	"min-h-9 shrink-0 gap-0 overflow-visible px-2.5 py-0 text-sm";

interface MapBarProps {
	readonly tool: MapTool;
	readonly canEditConstraints: boolean;
	readonly hiders: readonly HiderOption[];
	readonly selectedHiderId: string | null;
	readonly onOpenHiderSheet: () => void;
	readonly onCancel: () => void;
	readonly onUndoPolygonVertex: () => void;
	readonly onRadiusStep: (direction: 1 | -1) => void;
	readonly onCommitConstraint: (name: string) => void;
	readonly onSelectBoundary: (id: string | null) => void;
	readonly cut: boolean;
	readonly onCutChange: (cut: boolean) => void;
}

/**
 * Overlay on the map: seekers see which hider the fold is about, or the
 * editor while a shape is in progress. Measure, pin, and cuts have their
 * own cards.
 */
export function MapBar({
	tool,
	canEditConstraints,
	hiders,
	selectedHiderId,
	onOpenHiderSheet,
	onCancel,
	onUndoPolygonVertex,
	onRadiusStep,
	onCommitConstraint,
	onSelectBoundary,
	cut,
	onCutChange,
}: MapBarProps) {
	if (sheetOwnsBar(tool)) return null;

	if (
		tool.kind === "drawingRadiusConstraint" ||
		tool.kind === "drawingPolygonConstraint" ||
		(tool.kind === "pickingBoundaryConstraint" && tool.selectedId)
	) {
		return (
			<ConstraintDraft
				cut={cut}
				onCancel={onCancel}
				onCommitConstraint={onCommitConstraint}
				onCutChange={onCutChange}
				onRadiusStep={onRadiusStep}
				onSelectBoundary={onSelectBoundary}
				onUndoPolygonVertex={onUndoPolygonVertex}
				tool={tool}
			/>
		);
	}

	if (!canEditConstraints) return null;

	return (
		<Surface
			className="pointer-events-auto w-full max-w-sm"
			data-testid="map-bar"
			raised
		>
			<div className="flex items-center gap-2">
				<HiderChip
					hiders={hiders}
					onOpen={onOpenHiderSheet}
					selectedId={selectedHiderId}
				/>
				<ActionButton
					className="shrink-0"
					data-testid="map-ask"
					inline
					onClick={() => {}}
					size="compact"
				>
					Ask
				</ActionButton>
			</div>
		</Surface>
	);
}

function sheetOwnsBar(tool: MapTool): boolean {
	if (tool.kind === "searching" || tool.kind === "listingConstraints") {
		return true;
	}
	if (tool.kind === "measure") return true;
	if (tool.kind === "editingPin" || tool.kind === "placingPin") return true;
	if (tool.kind === "placingZone") return true;
	if (tool.kind === "pickingBoundaryConstraint" && !tool.selectedId) {
		return true;
	}
	return false;
}

function ConstraintDraft({
	cut,
	onCutChange,
	tool,
	onCancel,
	onCommitConstraint,
	onRadiusStep,
	onSelectBoundary,
	onUndoPolygonVertex,
}: {
	readonly cut: boolean;
	readonly onCutChange: (cut: boolean) => void;
	readonly tool: MapTool;
	readonly onCancel: () => void;
	readonly onCommitConstraint: (name: string) => void;
	readonly onRadiusStep: (direction: 1 | -1) => void;
	readonly onSelectBoundary: (id: string | null) => void;
	readonly onUndoPolygonVertex: () => void;
}) {
	const [name, setName] = useState("");
	const vertexCount =
		tool.kind === "drawingPolygonConstraint" ? tool.ring.length : null;
	const ready =
		(tool.kind === "drawingRadiusConstraint" && tool.center !== null) ||
		(tool.kind === "drawingPolygonConstraint" && tool.ring.length >= 3) ||
		(tool.kind === "pickingBoundaryConstraint" && tool.selectedId !== null);
	const note =
		tool.kind === "drawingRadiusConstraint" && tool.center === null
			? "Tap to place the centre, then drag the handles. The map still pans."
			: null;
	const pickAnother =
		tool.kind === "pickingBoundaryConstraint" && ready
			? () => onSelectBoundary(null)
			: null;

	return (
		<Surface className="pointer-events-auto w-full max-w-sm" raised>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<div className="min-w-0 flex-1">
						<ToolModePair
							left={{
								label: "+ Inside",
								on: !cut,
								onClick: () => onCutChange(false),
								testId: "constraint-mode-include",
								tone: "add",
							}}
							right={{
								label: "⊖ Outside",
								on: cut,
								onClick: () => onCutChange(true),
								testId: "constraint-mode-exclude",
								tone: "cut",
							}}
						/>
					</div>
					{tool.kind === "drawingPolygonConstraint" && (
						<ActionButton
							className={COMPACT_SECONDARY}
							disabled={tool.ring.length === 0}
							inline
							onClick={onUndoPolygonVertex}
							size="compact"
							tone="secondary"
						>
							Undo
						</ActionButton>
					)}
					{vertexCount !== null && (
						<span className="sr-only" data-testid="constraint-vertex-count">
							{vertexCount}
						</span>
					)}
				</div>
				{tool.kind === "drawingRadiusConstraint" && (
					<NumberStepper
						canDecrease={
							stepZoneMeters(tool.radiusMeters, -1) < tool.radiusMeters
						}
						canIncrease={
							stepZoneMeters(tool.radiusMeters, 1) > tool.radiusMeters
						}
						label="Radius"
						onStep={onRadiusStep}
						testId="constraint-radius"
						value={formatZone(tool.radiusMeters)}
					/>
				)}
				{note && <p className="text-ink-dim text-xs leading-snug">{note}</p>}
				{ready && (
					<Field
						data-testid="constraint-name"
						label="Name"
						maxLength={80}
						onChange={(event) => setName(event.target.value)}
						placeholder="Optional"
						value={name}
					/>
				)}
				<div className="flex items-center gap-2">
					<ActionButton
						className={COMPACT_SECONDARY}
						inline
						onClick={pickAnother ?? onCancel}
						size="compact"
						tone="secondary"
					>
						{pickAnother ? "Pick another" : "Cancel"}
					</ActionButton>
					<ActionButton
						beacon
						className="w-auto min-w-0 flex-1"
						data-testid={cut ? "they-are-outside" : "they-are-inside"}
						disabled={!ready}
						onClick={() => onCommitConstraint(name)}
					>
						{cut ? "They are outside this" : "They are inside this"}
					</ActionButton>
				</div>
			</div>
		</Surface>
	);
}
