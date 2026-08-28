import type { LngLat } from "@zero-lag/geo";
import type { LocationIssue } from "@zero-lag/platform";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { ColorPicker } from "@zero-lag/ui/components/picker";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { Surface } from "@zero-lag/ui/components/surface";
import { Switch } from "@zero-lag/ui/components/switch";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { COLOR_OPTIONS } from "../lobby/palette";
import { CoordinateFields } from "./coordinate-fields";
import { COMPACT_SECONDARY } from "./map-bar";
import type { MapPin } from "./pin-layer";
import {
	BOUNDARY_CONSTRAINT_LEVELS,
	type ConstraintListItem,
	formatDistance,
	type MapTool,
	pathSegments,
} from "./toolkit";

interface GpsHelpSheetProps {
	readonly open: boolean;
	readonly issue: LocationIssue | null;
	readonly onClose: () => void;
}

export function GpsHelpSheet({ open, issue, onClose }: GpsHelpSheetProps) {
	const lead =
		issue === "denied"
			? "Location is blocked for this page."
			: issue === "insecure_context"
				? "Location needs a secure page (https)."
				: issue === "unsupported"
					? "This browser cannot read a location."
					: "No fix yet — the phone has not seen satellites.";

	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="gps-help-sheet"
			title="Where is this phone?"
		>
			<p className="text-sm leading-snug">{lead}</p>
			{issue === "denied" ? (
				<p className="text-ink-dim text-sm leading-snug">
					In the browser or system settings, allow location for this site, then
					come back and tap locate again. A denial is remembered until you
					change it.
				</p>
			) : issue === "insecure_context" || issue === "unsupported" ? (
				<p className="text-ink-dim text-sm leading-snug">
					Open the game over https on a phone that has a GPS, rather than a
					plain http address or a desktop without a receiver.
				</p>
			) : (
				<p className="text-ink-dim text-sm leading-snug">
					Stand near a window or go outside and wait a few seconds. Indoors, a
					first fix can take a while even when permission is already granted.
				</p>
			)}
		</Sheet>
	);
}

interface MeasureCardProps {
	readonly tool: Extract<MapTool, { kind: "measure" }>;
	readonly onCancel: () => void;
	readonly onUndoMeasure: () => void;
	readonly onSeedMeasure: () => void;
}

/** Measure totals on the map, not under it. The pin/search sheets stay sheets. */
export function MeasureCard({
	tool,
	onCancel,
	onUndoMeasure,
	onSeedMeasure,
}: MeasureCardProps) {
	const measure = tool.measure;
	const segments = measure.kind === "path" ? pathSegments(measure.points) : [];
	const total = segments.reduce((sum, segment) => sum + segment, 0);
	const emptyPath = measure.kind === "path" && measure.points.length === 0;
	return (
		<Surface
			className="pointer-events-auto w-full px-3 py-2.5"
			data-testid="measure-card"
			raised
		>
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<span className="eyebrow block">
						{measure.kind === "path" ? "Along the path" : "Radius"}
					</span>
					<p
						className="font-medium font-mono text-lg leading-none"
						data-testid="measure-total"
					>
						{formatDistance(
							measure.kind === "path" ? total : measure.radiusMeters,
						)}
					</p>
				</div>
				{measure.kind === "path" && (
					<ActionButton
						className={COMPACT_SECONDARY}
						disabled={measure.points.length === 0}
						inline
						onClick={onUndoMeasure}
						size="compact"
						tone="secondary"
					>
						Undo
					</ActionButton>
				)}
			</div>
			<div className="mt-2 flex flex-col gap-2">
				{emptyPath && (
					<ActionButton onClick={onSeedMeasure} size="compact" tone="secondary">
						From me
					</ActionButton>
				)}
				<ActionButton onClick={onCancel} size="compact">
					Done
				</ActionButton>
			</div>
		</Surface>
	);
}

interface PinCardProps {
	readonly pin: MapPin | null;
	readonly draftPoint: LngLat | null;
	readonly teamColor: string;
	readonly onDraftPoint: (point: LngLat) => void;
	readonly onLook?: (look: { color: string; label: string }) => void;
	readonly onCancel: () => void;
	readonly onSave: (input: {
		label: string;
		note: string;
		color: string;
		radiusMeters: number | null;
		lng: number;
		lat: number;
	}) => void;
	readonly onDelete: (() => void) | null;
}

/** Pin details on the map. A map tap only writes the coordinates. */
export function PinCard({
	pin,
	draftPoint,
	teamColor,
	onDraftPoint,
	onLook,
	onCancel,
	onSave,
	onDelete,
}: PinCardProps) {
	const [label, setLabel] = useState(pin?.label ?? "");
	const [note, setNote] = useState(pin?.note ?? "");
	const [color, setColor] = useState(pin?.color ?? teamColor);

	function changeLabel(next: string) {
		setLabel(next);
		onLook?.({ color, label: next });
	}

	function changeColor(next: string) {
		setColor(next);
		onLook?.({ color: next, label });
	}

	const canPlace = draftPoint !== null;
	const editing = pin !== null;

	return (
		<Surface
			className="pointer-events-auto flex max-h-[45%] w-full flex-col gap-2 overflow-y-auto px-3 py-2.5"
			data-testid="pin-card"
			raised
		>
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!draftPoint) return;
					onSave({
						label,
						note,
						color,
						radiusMeters: pin?.radiusMeters ?? null,
						lng: draftPoint[0],
						lat: draftPoint[1],
					});
				}}
			>
				<CoordinateFields
					onPoint={onDraftPoint}
					point={draftPoint}
					testIdPrefix="pin"
				/>
				<Field
					label="What is it"
					maxLength={80}
					onChange={(event) => changeLabel(event.target.value)}
					placeholder="Optional"
					value={label}
				/>
				<label className="flex min-h-22 flex-col gap-1 rounded-tile border-2 border-hairline-strong bg-surface px-3.5 py-2">
					<span className="eyebrow">Note</span>
					<textarea
						className="min-h-16 w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-faint"
						onChange={(event) => setNote(event.target.value)}
						placeholder="Everyone on the team sees this"
						value={note}
					/>
				</label>
				{/* A grid, not a row: eight 40px squares plus their gaps were wider
				    than the card they sat in, so the last two fell off the edge. */}
				<ColorPicker
					className="[&_button]:aspect-auto [&_button]:h-10"
					label="Pin colour"
					onChange={changeColor}
					options={COLOR_OPTIONS}
					testIdPrefix="pin-color"
					value={color}
				/>
				<div className="flex items-stretch gap-2">
					<ActionButton
						className={COMPACT_SECONDARY}
						data-testid="pin-cancel"
						inline
						onClick={onCancel}
						size="comfortable"
						tone="secondary"
						type="button"
					>
						Cancel
					</ActionButton>
					<ActionButton
						className="w-auto min-w-0 flex-1"
						data-testid="pin-place"
						disabled={!canPlace}
						size="comfortable"
						type="submit"
					>
						{editing ? "Save pin" : "Place pin"}
					</ActionButton>
				</div>
				{onDelete && (
					<ActionButton
						onClick={onDelete}
						size="comfortable"
						tone="danger"
						type="button"
					>
						Delete
					</ActionButton>
				)}
			</form>
		</Surface>
	);
}

interface ConstraintsPickerSheetProps {
	readonly open: boolean;
	readonly defaultRadiusMeters: number;
	readonly current: MapTool;
	readonly onClose: () => void;
	readonly onPick: (next: MapTool) => void;
}

const CONSTRAINT_TYPES: readonly {
	readonly icon: IconName;
	readonly label: string;
	readonly hint: string;
	readonly testId: string;
	readonly kind: MapTool["kind"];
}[] = [
	{
		icon: "map-pin-simple-area",
		label: "Place",
		hint: "A Bezirk or Ortsteil",
		testId: "add-bezirk-constraint",
		kind: "pickingBoundaryConstraint",
	},
	{
		icon: "pencil-line",
		label: "Draw",
		hint: "A polygon on the map",
		testId: "add-polygon-constraint",
		kind: "drawingPolygonConstraint",
	},
	{
		icon: "circle-dashed",
		label: "Circle",
		hint: "A radius around a point",
		testId: "add-radius-constraint",
		kind: "drawingRadiusConstraint",
	},
	{
		icon: "line-segment",
		label: "Split",
		hint: "A thermometer line through two points",
		testId: "add-split-constraint",
		kind: "drawingSplitConstraint",
	},
	{
		icon: "crosshair",
		label: "Nearest",
		hint: "The cell of a point of interest",
		testId: "add-closest-poi-constraint",
		kind: "pickingClosestPoiConstraint",
	},
	{
		icon: "list-bullets",
		label: "Cuts",
		hint: "The ones already placed",
		testId: "constraint-list",
		kind: "listingConstraints",
	},
];

export function ConstraintsPickerSheet({
	open,
	defaultRadiusMeters,
	current,
	onClose,
	onPick,
}: ConstraintsPickerSheetProps) {
	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="constraints-picker"
			title="Add a constraint"
		>
			<div className="flex flex-col gap-2">
				{CONSTRAINT_TYPES.map((row) => (
					<button
						className={cn(
							"flex w-full items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left",
							current.kind === row.kind ? "border-action" : "border-hairline",
						)}
						data-testid={row.testId}
						key={row.testId}
						onClick={() =>
							onPick(constraintTool(row.kind, defaultRadiusMeters))
						}
						type="button"
					>
						<span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised">
							<Icon name={row.icon} size="md" />
						</span>
						<span className="min-w-0 flex-1">
							<b className="block text-[0.85rem] leading-tight">{row.label}</b>
							<span className="eyebrow mt-0.5 block text-ink-dim">
								{row.hint}
							</span>
						</span>
					</button>
				))}
			</div>
		</Sheet>
	);
}

function constraintTool(
	kind: MapTool["kind"],
	defaultRadiusMeters: number,
): MapTool {
	if (kind === "pickingBoundaryConstraint") {
		return {
			kind: "pickingBoundaryConstraint",
			levels: BOUNDARY_CONSTRAINT_LEVELS,
			selectedId: null,
		};
	}
	if (kind === "drawingPolygonConstraint") {
		return { kind: "drawingPolygonConstraint", ring: [] };
	}
	if (kind === "drawingRadiusConstraint") {
		return {
			kind: "drawingRadiusConstraint",
			centers: [],
			radiusMeters: defaultRadiusMeters,
			poiKind: null,
			pickingKind: false,
		};
	}
	if (kind === "drawingSplitConstraint") {
		return {
			kind: "drawingSplitConstraint",
			from: null,
			to: null,
			focus: "from",
		};
	}
	if (kind === "pickingClosestPoiConstraint") {
		return {
			kind: "pickingClosestPoiConstraint",
			filterKind: null,
			selectedId: null,
			radiusMeters: null,
		};
	}
	return { kind: "listingConstraints" };
}

interface CutsCardProps {
	readonly constraints: readonly ConstraintListItem[];
	readonly onToggle: (id: string, enabled: boolean) => void;
	readonly onRename: (id: string, name: string) => void;
	readonly onRemove: (id: string) => void;
}

export function CutsCard({
	constraints,
	onToggle,
	onRename,
	onRemove,
}: CutsCardProps) {
	return (
		<Surface
			className="pointer-events-auto flex max-h-[33%] w-full flex-col gap-2 overflow-hidden px-3 py-2.5"
			data-testid="constraint-list-sheet"
			raised
		>
			<span className="eyebrow shrink-0">Cuts</span>
			{constraints.length === 0 ? (
				<p className="text-ink-dim text-sm">None yet.</p>
			) : (
				<div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
					{constraints.map((row) => (
						<ConstraintRow
							key={row.id}
							onRemove={
								row.source === "manual" ? () => onRemove(row.id) : undefined
							}
							onRename={(name) => onRename(row.id, name)}
							onToggle={() => onToggle(row.id, !row.enabled)}
							row={row}
						/>
					))}
				</div>
			)}
		</Surface>
	);
}

function ConstraintRow({
	row,
	onToggle,
	onRename,
	onRemove,
}: {
	readonly row: ConstraintListItem;
	readonly onToggle: () => void;
	readonly onRename: (name: string) => void;
	readonly onRemove?: () => void;
}) {
	const minus = row.mode === "exclude";
	const kind =
		row.kind === "radius"
			? "Circle"
			: row.kind === "halfPlane"
				? "Split"
				: "Area";
	const origin = row.source === "answer" ? "from an answer" : "placed";
	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-[15px] border border-hairline bg-surface py-2 pr-2 pl-2.5",
				minus ? "border-l-4 border-l-danger" : "border-l-4 border-l-live",
				row.enabled ? "" : "opacity-55",
			)}
			data-testid={`constraint-${row.id}`}
		>
			<span
				aria-hidden
				className={cn(
					"grid size-6 shrink-0 place-items-center rounded-lg font-bold text-sm",
					minus ? "bg-danger/20 text-danger" : "bg-live/20 text-live",
				)}
			>
				<Icon name={minus ? "minus" : "plus"} size="xs" />
			</span>
			<label className="min-w-0 flex-1">
				<span className="sr-only">Constraint name</span>
				<input
					className="block w-full truncate bg-transparent font-bold text-[0.8rem] leading-tight outline-none"
					data-testid={`constraint-name-${row.id}`}
					defaultValue={row.name ?? ""}
					key={`${row.id}:${row.name ?? ""}`}
					maxLength={80}
					onBlur={(event) => {
						const next = event.target.value.trim();
						if (next !== (row.name ?? "")) onRename(next);
					}}
					placeholder={`${kind} · ${row.mode}`}
				/>
				<span className="mt-0.5 block font-mono text-[0.55rem] text-ink-faint uppercase tracking-[0.07em]">
					{kind} · {origin}
				</span>
			</label>
			<Switch
				label={row.enabled ? "Turn this cut off" : "Turn this cut on"}
				on={row.enabled}
				onChange={() => onToggle()}
				testId={`toggle-constraint-${row.id}`}
			/>
			{onRemove && (
				<button
					aria-label={`Remove ${row.name ?? kind}`}
					className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint"
					data-testid={`remove-constraint-${row.id}`}
					onClick={onRemove}
					type="button"
				>
					<Icon name="x" size="sm" />
				</button>
			)}
		</div>
	);
}
