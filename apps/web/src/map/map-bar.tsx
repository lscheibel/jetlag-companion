import { POI_KIND_LABELS } from "@zero-lag/catalog";
import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Icon } from "@zero-lag/ui/components/icon";
import { NumberStepper } from "@zero-lag/ui/components/number-stepper";
import { Surface } from "@zero-lag/ui/components/surface";
import {
	ToggleButton,
	ToggleModePair,
} from "@zero-lag/ui/components/toggle-button";
import { useState } from "react";
import { HiderChip, type HiderOption } from "../game/hider-selector";
import {
	clampZoneMeters,
	parseZoneMeters,
	stepZoneMeters,
} from "../setup/game-size";
import { CoordinateFields } from "./coordinate-fields";
import {
	type MapTool,
	type RadiusConstraintTool,
	radiusConstraintReady,
} from "./toolkit";

type SplitTool = Extract<MapTool, { kind: "drawingSplitConstraint" }>;
type ClosestPoiTool = Extract<MapTool, { kind: "pickingClosestPoiConstraint" }>;

/**
 * The quieter half of a two-button row on the map.
 *
 * It keeps the touch floor — a control that shrinks to 36px because it is the
 * less important of two is a control that is harder to hit for being less
 * important, which is backwards. What it gives up is width, not height, so the
 * pair reads as one row rather than as two sizes of button.
 */
export const COMPACT_SECONDARY = "shrink-0";

interface MapBarProps {
	readonly tool: MapTool;
	readonly canEditConstraints: boolean;
	readonly hiders: readonly HiderOption[];
	readonly selectedHiderId: string | null;
	readonly onOpenHiderSheet: () => void;
	readonly onActions: () => void;
	readonly onCancel: () => void;
	readonly onUndoPolygonVertex: () => void;
	readonly onRadiusStep: (direction: 1 | -1) => void;
	readonly onCommitConstraint: (name: string) => void;
	readonly onSelectBoundary: (id: string | null) => void;
	readonly onSplitChange: (next: SplitTool) => void;
	readonly onRadiusChange: (next: RadiusConstraintTool) => void;
	readonly onClosestPoiChange: (next: ClosestPoiTool) => void;
	readonly radiusCenters: readonly LngLat[];
	readonly closestPoiCenter: LngLat | null;
	readonly fromYou: LngLat | null;
	readonly fallbackRadiusMeters: number;
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
	onActions,
	onCancel,
	onUndoPolygonVertex,
	onRadiusStep,
	onCommitConstraint,
	onSelectBoundary,
	onSplitChange,
	onRadiusChange,
	onClosestPoiChange,
	radiusCenters,
	closestPoiCenter,
	fromYou,
	fallbackRadiusMeters,
	cut,
	onCutChange,
}: MapBarProps) {
	if (sheetOwnsBar(tool)) return null;

	if (
		tool.kind === "drawingRadiusConstraint" ||
		tool.kind === "drawingPolygonConstraint" ||
		tool.kind === "drawingSplitConstraint" ||
		(tool.kind === "pickingBoundaryConstraint" && tool.selectedId) ||
		(tool.kind === "pickingClosestPoiConstraint" && tool.selectedId)
	) {
		return (
			<ConstraintDraft
				cut={cut}
				onCancel={onCancel}
				onCommitConstraint={onCommitConstraint}
				onCutChange={onCutChange}
				onRadiusStep={onRadiusStep}
				onSelectBoundary={onSelectBoundary}
				onSplitChange={onSplitChange}
				onRadiusChange={onRadiusChange}
				onClosestPoiChange={onClosestPoiChange}
				radiusCenters={radiusCenters}
				closestPoiCenter={closestPoiCenter}
				fromYou={fromYou}
				fallbackRadiusMeters={fallbackRadiusMeters}
				onUndoPolygonVertex={onUndoPolygonVertex}
				tool={tool}
			/>
		);
	}

	if (!canEditConstraints) return null;

	return (
		<Surface
			className="pointer-events-auto w-full"
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
					aria-label="Actions"
					className="shrink-0 [&_.zl-press-face]:size-tap [&_.zl-press-face]:items-center [&_.zl-press-face]:justify-center [&_.zl-press-face]:px-0"
					data-testid="map-ask"
					inline
					onClick={onActions}
					size="compact"
				>
					<span className="text-lg leading-none">!</span>
				</ActionButton>
			</div>
		</Surface>
	);
}

export function sheetOwnsBar(tool: MapTool): boolean {
	if (tool.kind === "searching" || tool.kind === "listingConstraints") {
		return true;
	}
	if (tool.kind === "measure") return true;
	if (tool.kind === "editingPin" || tool.kind === "placingPin") return true;
	if (tool.kind === "placingZone") return true;
	if (tool.kind === "pickingBoundaryConstraint" && !tool.selectedId) {
		return true;
	}
	if (tool.kind === "pickingClosestPoiConstraint" && !tool.selectedId) {
		return true;
	}
	if (tool.kind === "drawingRadiusConstraint" && tool.pickingKind) {
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
	onSplitChange,
	onRadiusChange,
	onClosestPoiChange,
	radiusCenters,
	closestPoiCenter,
	fromYou,
	fallbackRadiusMeters,
	onUndoPolygonVertex,
}: {
	readonly cut: boolean;
	readonly onCutChange: (cut: boolean) => void;
	readonly tool: MapTool;
	readonly onCancel: () => void;
	readonly onCommitConstraint: (name: string) => void;
	readonly onRadiusStep: (direction: 1 | -1) => void;
	readonly onSelectBoundary: (id: string | null) => void;
	readonly onSplitChange: (next: SplitTool) => void;
	readonly onRadiusChange: (next: RadiusConstraintTool) => void;
	readonly onClosestPoiChange: (next: ClosestPoiTool) => void;
	readonly radiusCenters: readonly LngLat[];
	readonly closestPoiCenter: LngLat | null;
	readonly fromYou: LngLat | null;
	readonly fallbackRadiusMeters: number;
	readonly onUndoPolygonVertex: () => void;
}) {
	const [name, setName] = useState("");
	const split = tool.kind === "drawingSplitConstraint" ? tool : null;
	const radius = tool.kind === "drawingRadiusConstraint" ? tool : null;
	const vertexCount =
		tool.kind === "drawingPolygonConstraint" ? tool.ring.length : null;
	const closest = tool.kind === "pickingClosestPoiConstraint" ? tool : null;
	const ready =
		(radius !== null && radiusConstraintReady(radiusCenters)) ||
		(tool.kind === "drawingPolygonConstraint" && tool.ring.length >= 3) ||
		(tool.kind === "pickingBoundaryConstraint" && tool.selectedId !== null) ||
		(closest !== null && closest.selectedId !== null) ||
		(split !== null &&
			split.from !== null &&
			split.to !== null &&
			distanceMeters(split.from, split.to) > 0);
	const pickAnother =
		tool.kind === "pickingBoundaryConstraint" && ready
			? () => onSelectBoundary(null)
			: closest !== null && ready
				? () => onClosestPoiChange({ ...closest, selectedId: null })
				: radius?.poiKind
					? () => onRadiusChange({ ...radius, pickingKind: true })
					: null;

	function setSplitPoint(which: "from" | "to", point: LngLat) {
		if (!split) return;
		onSplitChange({ ...split, [which]: point });
	}

	function setRadiusPoint(point: LngLat) {
		if (!radius) return;
		onRadiusChange({
			...radius,
			centers: [point],
			poiKind: null,
			pickingKind: false,
		});
	}

	return (
		<Surface
			className="pointer-events-auto flex max-h-[45%] w-full flex-col overflow-y-auto"
			data-testid={split ? "split-draft" : radius ? "radius-draft" : undefined}
			raised
		>
			<div className="flex flex-col gap-2">
				{split && (
					<>
						<p className="text-ink-dim text-xs leading-snug">
							Tap the map to place the highlighted point.
						</p>
						<div className="flex flex-col gap-1">
							<span className="eyebrow">From</span>
							<CoordinateFields
								focused={split.focus === "from"}
								onFocus={() => onSplitChange({ ...split, focus: "from" })}
								onPoint={(point) => setSplitPoint("from", point)}
								point={split.from}
								testIdPrefix="split-from"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<span className="eyebrow">To</span>
							<CoordinateFields
								focused={split.focus === "to"}
								onFocus={() => onSplitChange({ ...split, focus: "to" })}
								onPoint={(point) => setSplitPoint("to", point)}
								point={split.to}
								testIdPrefix="split-to"
							/>
						</div>
					</>
				)}
				{radius && (
					<RadiusPosition
						centers={radiusCenters}
						onAllOfType={() => onRadiusChange({ ...radius, pickingKind: true })}
						onPoint={setRadiusPoint}
						poiKind={radius.poiKind}
					/>
				)}
				<div className="flex items-stretch gap-2">
					<ToggleModePair className="min-w-0 flex-1">
						{split ? (
							<>
								<ToggleButton
									icon={<Icon name="scissors" size="xs" />}
									onClick={() => onCutChange(false)}
									pressed={!cut}
									shape="bar"
									testId="constraint-mode-from"
									tone="cut"
								>
									From side
								</ToggleButton>
								<ToggleButton
									icon={<Icon name="scissors" size="xs" />}
									onClick={() => onCutChange(true)}
									pressed={cut}
									shape="bar"
									testId="constraint-mode-to"
									tone="cut"
								>
									To side
								</ToggleButton>
							</>
						) : (
							<>
								<ToggleButton
									icon={<Icon name="plus" size="xs" />}
									onClick={() => onCutChange(false)}
									pressed={!cut}
									shape="bar"
									testId="constraint-mode-include"
									tone="add"
								>
									Inside
								</ToggleButton>
								<ToggleButton
									icon={<Icon name="scissors" size="xs" />}
									onClick={() => onCutChange(true)}
									pressed={cut}
									shape="bar"
									testId="constraint-mode-exclude"
									tone="cut"
								>
									Outside
								</ToggleButton>
							</>
						)}
					</ToggleModePair>
					{tool.kind === "drawingPolygonConstraint" && (
						<ActionButton
							className={COMPACT_SECONDARY}
							disabled={tool.ring.length === 0}
							inline
							onClick={onUndoPolygonVertex}
							// Comfortable, so it stands level with the mode pair beside it.
							size="comfortable"
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
				{radius && (
					<NumberStepper
						canDecrease={
							stepZoneMeters(radius.radiusMeters, -1) < radius.radiusMeters
						}
						canIncrease={
							stepZoneMeters(radius.radiusMeters, 1) > radius.radiusMeters
						}
						label="Radius"
						onCommit={(raw) => {
							const parsed = parseZoneMeters(raw);
							if (parsed === null) return;
							onRadiusChange({
								...radius,
								radiusMeters: clampZoneMeters(parsed),
							});
						}}
						onStep={onRadiusStep}
						testId="constraint-radius"
						unit="m"
						value={String(Math.round(radius.radiusMeters))}
					/>
				)}
				{closest && (
					<>
						<ToggleModePair>
							<ToggleButton
								onClick={() =>
									onClosestPoiChange({ ...closest, radiusMeters: null })
								}
								pressed={closest.radiusMeters === null}
								shape="bar"
								testId="closest-poi-radius-off"
							>
								Whole cell
							</ToggleButton>
							<ToggleButton
								onClick={() => {
									if (closest.radiusMeters !== null) return;
									const meters =
										fromYou && closestPoiCenter
											? distanceMeters(fromYou, closestPoiCenter)
											: fallbackRadiusMeters;
									onClosestPoiChange({
										...closest,
										radiusMeters: meters > 0 ? meters : fallbackRadiusMeters,
									});
								}}
								pressed={closest.radiusMeters !== null}
								shape="bar"
								testId="closest-poi-radius-on"
							>
								Limit radius
							</ToggleButton>
						</ToggleModePair>
						{closest.radiusMeters !== null && (
							<NumberStepper
								canDecrease={
									stepZoneMeters(closest.radiusMeters, -1) <
									closest.radiusMeters
								}
								canIncrease={
									stepZoneMeters(closest.radiusMeters, 1) > closest.radiusMeters
								}
								label="Radius"
								onCommit={(raw) => {
									const parsed = parseZoneMeters(raw);
									if (parsed === null) return;
									onClosestPoiChange({
										...closest,
										radiusMeters: clampZoneMeters(parsed),
									});
								}}
								onStep={(direction) => {
									const current = closest.radiusMeters;
									if (current === null) return;
									onClosestPoiChange({
										...closest,
										radiusMeters: stepZoneMeters(current, direction),
									});
								}}
								testId="closest-poi-radius"
								unit="m"
								value={String(Math.round(closest.radiusMeters))}
							/>
						)}
					</>
				)}
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
				{/* One height across the row: the quieter button is narrower, never
				    shorter. */}
				<div className="flex items-stretch gap-2">
					<ActionButton
						className={COMPACT_SECONDARY}
						inline
						onClick={pickAnother ?? onCancel}
						size="comfortable"
						tone="secondary"
					>
						{pickAnother ? "Pick another" : "Cancel"}
					</ActionButton>
					<ActionButton
						beacon
						className="w-auto min-w-0 flex-1"
						data-testid={
							split
								? cut
									? "exclude-to-side"
									: "exclude-from-side"
								: cut
									? "they-are-outside"
									: "they-are-inside"
						}
						disabled={!ready}
						onClick={() => onCommitConstraint(name)}
						size="comfortable"
					>
						{split
							? cut
								? "Exclude the to side"
								: "Exclude the from side"
							: cut
								? "They are outside this"
								: "They are inside this"}
					</ActionButton>
				</div>
			</div>
		</Surface>
	);
}

function RadiusPosition({
	poiKind,
	centers,
	onPoint,
	onAllOfType,
}: {
	readonly poiKind: RadiusConstraintTool["poiKind"];
	readonly centers: readonly LngLat[];
	readonly onPoint: (point: LngLat) => void;
	readonly onAllOfType: () => void;
}) {
	if (poiKind) {
		return (
			<div className="flex flex-col gap-1" data-testid="radius-poi-kind">
				<span className="eyebrow">Centre</span>
				<p className="text-sm leading-snug">
					{POI_KIND_LABELS[poiKind]}
					<span className="text-ink-dim"> · {centers.length}</span>
				</p>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-2">
			<p className="text-ink-dim text-xs leading-snug">
				Tap the map to place the centre, or paste coordinates.
			</p>
			<CoordinateFields
				onPoint={onPoint}
				point={centers[0] ?? null}
				testIdPrefix="radius-center"
			/>
			<ActionButton
				data-testid="radius-all-of-type"
				onClick={onAllOfType}
				size="comfortable"
				tone="secondary"
			>
				All of this type
			</ActionButton>
		</div>
	);
}
