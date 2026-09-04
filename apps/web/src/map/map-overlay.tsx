import type { LngLat, MultiPolygon } from "@zero-lag/geo";
import type { LocationIssue } from "@zero-lag/platform";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { ColorPicker } from "@zero-lag/ui/components/picker";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { Surface } from "@zero-lag/ui/components/surface";
import { Switch } from "@zero-lag/ui/components/switch";
import { cn } from "@zero-lag/ui/lib/utils";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ruledOutFraction } from "../game/search-area";
import { COLOR_OPTIONS } from "../lobby/palette";
import {
	ConstraintThumb,
	type ThumbFrame,
	thumbFrame,
} from "./constraint-thumb";
import { COMPACT_SECONDARY } from "./map-bar";
import type { MapPin } from "./pin-layer";
import { PointField } from "./point-field";
import { absoluteTime } from "./staleness";
import {
	BOUNDARY_CONSTRAINT_LEVELS,
	type ConstraintListItem,
	canMeasureToYou,
	constraintEditTool,
	constraintKindLabel,
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
	readonly fromYou: LngLat | null;
	readonly onCancel: () => void;
	readonly onUndoMeasure: () => void;
	readonly onAddPoint: (point: LngLat) => void;
}

type MeasureInsert = "me" | "coordinates";

/** Measure totals on the map, not under it. The pin/search sheets stay sheets. */
export function MeasureCard({
	tool,
	fromYou,
	onCancel,
	onUndoMeasure,
	onAddPoint,
}: MeasureCardProps) {
	const [insert, setInsert] = useState<MeasureInsert | null>(null);
	const measure = tool.measure;
	const path = measure.kind === "path" ? measure.points : null;
	const segments = path ? pathSegments(path) : [];
	const total = segments.reduce((sum, segment) => sum + segment, 0);
	const emptyPath = path !== null && path.length === 0;
	const showToMe = path !== null && canMeasureToYou(path, fromYou);
	const insertTitle =
		insert === "me"
			? "To me"
			: emptyPath
				? "From coordinates"
				: "To coordinates";

	return (
		<>
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
						<ActionButton
							data-testid="measure-from-me"
							disabled={!fromYou}
							onClick={() => {
								if (!fromYou) return;
								onAddPoint(fromYou);
							}}
							size="compact"
							tone="secondary"
						>
							From me
						</ActionButton>
					)}
					{showToMe && (
						<ActionButton
							data-testid="measure-to-me"
							onClick={() => setInsert("me")}
							size="compact"
							tone="secondary"
						>
							To me
						</ActionButton>
					)}
					{path !== null && (
						<ActionButton
							data-testid="measure-coordinates"
							onClick={() => setInsert("coordinates")}
							size="compact"
							tone="secondary"
						>
							{emptyPath ? "From coordinates" : "To coordinates"}
						</ActionButton>
					)}
					<ActionButton onClick={onCancel} size="compact">
						Done
					</ActionButton>
				</div>
			</Surface>
			<MeasureInsertSheet
				initial={insert === "me" ? fromYou : null}
				onClose={() => setInsert(null)}
				onInsert={(point) => {
					setInsert(null);
					onAddPoint(point);
				}}
				open={insert !== null}
				title={insertTitle}
			/>
		</>
	);
}

function MeasureInsertSheet({
	open,
	title,
	initial,
	onClose,
	onInsert,
}: {
	readonly open: boolean;
	readonly title: string;
	readonly initial: LngLat | null;
	readonly onClose: () => void;
	readonly onInsert: (point: LngLat) => void;
}) {
	const shownTitle = useHeldValue(open, title);
	const shownInitial = useHeldValue(open, initial);
	if (typeof document === "undefined") return null;
	return createPortal(
		<Sheet
			onClose={onClose}
			open={open}
			testId="measure-insert-sheet"
			title={shownTitle}
		>
			<MeasureInsertForm
				initial={shownInitial}
				key={shownTitle}
				onInsert={onInsert}
			/>
		</Sheet>,
		document.body,
	);
}

function MeasureInsertForm({
	initial,
	onInsert,
}: {
	readonly initial: LngLat | null;
	readonly onInsert: (point: LngLat) => void;
}) {
	const [point, setPoint] = useState<LngLat | null>(initial);
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!point) return;
				onInsert(point);
			}}
		>
			<PointField onPoint={setPoint} point={point} testIdPrefix="measure" />
			<ActionButton
				data-testid="measure-insert"
				disabled={!point}
				type="submit"
			>
				Add point
			</ActionButton>
		</form>
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
				<PointField
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
				    than the card they sat in, so the last two fell off the edge.
				    Each swatch fills its column and only the height is capped, so a
				    narrow card gives squares and a wide one gives squat rectangles —
				    never a swatch on end. The width has to be stated for that: left
				    to stretch, the ratio pulls the width back down to the capped
				    height and the slack goes to the gaps instead. */}
				<ColorPicker
					className="[&_button]:max-h-10 [&_button]:w-full"
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
		};
	}
	return { kind: "listingConstraints" };
}

interface CutsCardProps {
	readonly constraints: readonly ConstraintListItem[];
	/** The game's valid hiding area: the thumbnails' frame, and the fold's seed. */
	readonly seed: MultiPolygon | null;
	readonly stopsRemaining: number;
	readonly onToggle: (id: string, enabled: boolean) => void;
	readonly onRename: (id: string, name: string) => void;
	readonly onRemove: (id: string) => void;
	readonly onEdit: (id: string) => void;
	/** Opens the picker: the one place a new cut is started from. */
	readonly onAdd: () => void;
	readonly onClose: () => void;
}

/**
 * The cuts, as a ruled list. Deck 12 R1.
 *
 * A ledger rather than a stack of cards: hairlines instead of borders, an index
 * down the left because the order a cut was made in is the only order there is,
 * and one right-aligned column of square kilometres that can be read straight
 * down. Nothing regroups and nothing moves when a switch moves — a list that
 * rearranges itself under a thumb is a list you have to re-read after every tap.
 *
 * Both the thumbnails' frame and the per-row numbers cost real geometry, so they
 * are computed here rather than in the map screen: this card is mounted only
 * while the list is open, which is the only time anybody reads either.
 */
export function CutsCard({
	constraints,
	seed,
	stopsRemaining,
	onToggle,
	onRename,
	onRemove,
	onEdit,
	onAdd,
	onClose,
}: CutsCardProps) {
	const [openId, setOpenId] = useState<string | null>(null);
	const frame = useMemo(() => thumbFrame(seed), [seed]);
	const ruledOut = useMemo(
		() => ruledOutFraction(seed, constraints),
		[seed, constraints],
	);
	// The newest cut is the one you just made, so that is where the list opens.
	// Set on the scroller rather than by `scrollIntoView`, which would also
	// scroll whatever the map screen happens to be sitting inside.
	const scroller = useRef<HTMLUListElement | null>(null);
	useEffect(() => {
		const list = scroller.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, []);

	/*
	 * Capped at just over half, so the map is never less than half the screen:
	 * the fold redrawing under a thumb is the reason this list is on the map at
	 * all. The cap resolves now that the dock has a height of its own to measure
	 * against — see `mapCardMotionProps`.
	 */
	return (
		<Surface
			className="pointer-events-auto flex max-h-[55%] w-full min-w-0 flex-col overflow-hidden p-0"
			data-testid="constraint-list-sheet"
			raised
		>
			<div className="flex shrink-0 items-start gap-2 px-4 pt-4 pb-3">
				<div className="min-w-0 flex-1">
					<p className="font-display font-extrabold text-base leading-none">
						{constraints.length} {constraints.length === 1 ? "cut" : "cuts"}
					</p>
					<p className="eyebrow mt-1 truncate">
						{ruledOut === null
							? "no map yet"
							: `${Math.round(ruledOut * 100)}% ruled out`}{" "}
						· {stopsRemaining} stops left
					</p>
				</div>
			</div>
			{constraints.length === 0 ? (
				<p className="px-3 pb-3 text-ink-dim text-sm">None yet.</p>
			) : (
				<div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
					<ul
						className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-hairline bg-surface"
						ref={scroller}
					>
						{constraints.map((row) => (
							<ConstraintRow
								frame={frame}
								key={row.id}
								onEdit={
									constraintEditTool(row) ? () => onEdit(row.id) : undefined
								}
								onOpen={() =>
									setOpenId((current) => (current === row.id ? null : row.id))
								}
								onRemove={
									row.source === "manual" ? () => onRemove(row.id) : undefined
								}
								onRename={(name) => onRename(row.id, name)}
								onToggle={() => onToggle(row.id, !row.enabled)}
								open={openId === row.id}
								row={row}
							/>
						))}
					</ul>
				</div>
			)}
			{/* The way out and the way to another one, in the app's own order:
			    the retreat compact on the left, the action taking the rest. */}
			<div className="flex w-full items-stretch gap-2 px-3 pb-4">
				<ActionButton
					className={COMPACT_SECONDARY}
					data-testid="cuts-done"
					inline
					onClick={onClose}
					size="comfortable"
					tone="secondary"
					type="button"
				>
					Done
				</ActionButton>
				<ActionButton
					className="w-auto min-w-0 flex-1"
					data-testid="add-constraint"
					onClick={onAdd}
					size="comfortable"
					type="button"
				>
					Add a cut
				</ActionButton>
			</div>
		</Surface>
	);
}

function ConstraintRow({
	row,
	frame,
	open,
	onOpen,
	onToggle,
	onRename,
	onRemove,
	onEdit,
}: {
	readonly row: ConstraintListItem;
	readonly frame: ThumbFrame | null;
	readonly open: boolean;
	readonly onOpen: () => void;
	readonly onToggle: () => void;
	readonly onRename: (name: string) => void;
	readonly onRemove?: () => void;
	readonly onEdit?: () => void;
}) {
	const kind = constraintKindLabel(row.geometry);
	const label = row.name?.trim() || kind;

	return (
		<li
			className="border-hairline border-t first:border-t-0"
			data-testid={`constraint-${row.id}`}
		>
			<div className={cn("flex items-center gap-2.5 py-2 pr-2.5")}>
				{/*
				 * Opening is the row's tap and toggling is the switch's, so the two
				 * do not share a target: a mis-tap costs a sheet, never a redraw.
				 */}
				<button
					aria-expanded={open}
					className="flex min-w-0 flex-1 items-center gap-2.5 pr-1 pl-2.5 text-left"
					data-testid={`constraint-open-${row.id}`}
					onClick={onOpen}
					type="button"
				>
					<ConstraintThumb
						className={row.enabled ? "" : "opacity-45 grayscale"}
						frame={frame}
						geometry={row.geometry}
						mode={row.mode}
					/>
					<span className="min-w-0 flex-1">
						<span
							className={cn(
								"block truncate font-bold text-[0.8rem] leading-tight",
								row.enabled
									? ""
									: "font-medium text-ink-faint line-through decoration-hairline-strong",
							)}
						>
							{label}
						</span>
					</span>
					<span className="shrink-0 font-mono text-[0.6rem] text-ink-faint tabular-nums">
						{absoluteTime(row.createdAt)}
					</span>
				</button>
				<Switch
					label={row.enabled ? "Turn this cut off" : "Turn this cut on"}
					on={row.enabled}
					onChange={() => onToggle()}
					testId={`toggle-constraint-${row.id}`}
				/>
			</div>
			{open && (
				<div className="flex flex-col gap-2 px-2.5 pb-2.5">
					<label className="flex min-h-tap items-center gap-2 rounded-control border-2 border-hairline-strong bg-surface-raised px-3">
						<span className="sr-only">Constraint name</span>
						<input
							className="w-full min-w-0 bg-transparent font-semibold text-[0.8rem] text-ink outline-none placeholder:text-ink-faint"
							data-testid={`constraint-name-${row.id}`}
							defaultValue={row.name ?? ""}
							key={`${row.id}:${row.name ?? ""}`}
							maxLength={80}
							onBlur={(event) => {
								const next = event.target.value.trim();
								if (next !== (row.name ?? "")) onRename(next);
							}}
							placeholder={kind}
						/>
					</label>
					<div className="flex gap-1.5">
						{/*
						 * Reopening the tool is the row's redraw. Absent when nothing can
						 * be reopened — an answer's cut, or a polygon from before origins
						 * were recorded.
						 */}
						{onEdit && (
							<RowTool onClick={onEdit} testId={`edit-constraint-${row.id}`}>
								Edit
							</RowTool>
						)}
						{onRemove && (
							<RowTool
								danger
								onClick={onRemove}
								testId={`remove-constraint-${row.id}`}
							>
								Remove
							</RowTool>
						)}
					</div>
				</div>
			)}
		</li>
	);
}

function RowTool({
	children,
	onClick,
	testId,
	danger = false,
}: {
	readonly children: ReactNode;
	readonly onClick: () => void;
	readonly testId: string;
	readonly danger?: boolean;
}) {
	return (
		<button
			className={cn(
				"flex min-h-9 flex-1 items-center justify-center rounded-control border border-hairline bg-surface-raised font-mono text-[0.6rem] uppercase tracking-[0.09em]",
				danger ? "border-danger/35 text-danger" : "text-ink-dim",
			)}
			data-testid={testId}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
