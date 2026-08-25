import type { LocationIssue } from "@zero-lag/platform";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { Surface } from "@zero-lag/ui/components/surface";
import { Switch } from "@zero-lag/ui/components/switch";
import { cn } from "@zero-lag/ui/lib/utils";
import { COMPACT_SECONDARY } from "./map-bar";
import {
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
			className="pointer-events-auto w-full max-w-sm px-3 py-2.5"
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

export function PinPromptCard() {
	return (
		<Surface
			className="pointer-events-auto w-full max-w-sm px-3 py-2.5"
			data-testid="pin-prompt-card"
			raised
		>
			<p className="text-sm leading-snug">Tap to drop a pin</p>
		</Surface>
	);
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
			className="pointer-events-auto flex max-h-[33%] w-full max-w-sm flex-col gap-2 overflow-hidden px-3 py-2.5"
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
	const kind = row.kind === "radius" ? "Circle" : "Area";
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
				{minus ? "−" : "+"}
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
					×
				</button>
			)}
		</div>
	);
}
