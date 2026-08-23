import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { useState } from "react";
import { TEAM_COLORS } from "../lobby/palette";
import type { MapPin } from "./pin-layer";
import {
	type BoundaryListItem,
	type ConstraintListItem,
	formatCoordinates,
	formatDistance,
	type MapTool,
	pathSegments,
	type SearchableStop,
	type SearchResult,
	searchStops,
} from "./toolkit";

interface MapToolSheetProps {
	readonly tool: MapTool;
	readonly origin: LngLat;
	readonly draftPoint: LngLat | null;
	readonly editingPin: MapPin | null;
	readonly teamColor: string;
	readonly canPlaceZone: boolean;
	readonly canEditConstraints: boolean;
	readonly constraints: readonly ConstraintListItem[];
	/** The stops this game carries — what place search runs over. m4-spec §5. */
	readonly stops: readonly SearchableStop[];
	readonly onToolChange: (tool: MapTool) => void;
	readonly onCancel: () => void;
	readonly onUndoMeasure: () => void;
	readonly onUndoPolygonVertex: () => void;
	readonly onSeedMeasure: () => void;
	readonly onSavePin: (input: {
		label: string;
		note: string;
		color: string;
		radiusMeters: number | null;
	}) => void;
	readonly onDeletePin: () => void;
	readonly onSaveZone: (note: string) => void;
	readonly onClearZone: () => void;
	readonly onSearchResult: (result: SearchResult) => void;
	readonly onSearchStopZone: (stop: SearchableStop) => void;
	readonly onCommitConstraint: (
		mode: "include" | "exclude",
		name: string,
	) => void;
	readonly onToggleConstraint: (id: string, enabled: boolean) => void;
	readonly onRenameConstraint: (id: string, name: string) => void;
	readonly onRemoveConstraint: (id: string) => void;
	readonly boundaries: readonly BoundaryListItem[];
	readonly onSelectBoundary: (id: string | null) => void;
}

export function MapToolSheet(props: MapToolSheetProps) {
	if (props.tool.kind === "measure") return <MeasureSheet {...props} />;
	if (props.tool.kind === "placingPin" && props.draftPoint) {
		return <PinForm key={formatCoordinates(props.draftPoint)} {...props} />;
	}
	if (props.tool.kind === "editingPin" && props.editingPin) {
		return <PinForm key={props.editingPin.id} {...props} />;
	}
	if (props.tool.kind === "placingZone" && props.tool.center) {
		return <ZoneForm {...props} />;
	}
	if (
		props.tool.kind === "drawingRadiusConstraint" &&
		props.tool.center !== null
	) {
		return <ConstraintConfirmSheet {...props} />;
	}
	if (
		props.tool.kind === "drawingPolygonConstraint" &&
		props.tool.ring.length >= 3
	) {
		return <ConstraintConfirmSheet {...props} />;
	}
	if (props.tool.kind === "drawingPolygonConstraint") {
		return <PolygonConstraintPrompt {...props} />;
	}
	if (props.tool.kind === "listingConstraints") {
		return <ConstraintListSheet {...props} />;
	}
	if (
		props.tool.kind === "pickingBoundaryConstraint" &&
		props.tool.selectedId
	) {
		return <ConstraintConfirmSheet {...props} />;
	}
	if (props.tool.kind === "pickingBoundaryConstraint") {
		return <BoundaryPickerSheet {...props} />;
	}
	if (props.tool.kind !== "none") {
		return (
			<ActivePrompt name={toolName(props.tool)} onCancel={props.onCancel} />
		);
	}
	return <ToolMenu {...props} />;
}

function ToolMenu(props: MapToolSheetProps) {
	const [query, setQuery] = useState("");
	const results = searchStops(props.stops, query, props.origin).slice(0, 8);
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex gap-2 overflow-x-auto pb-2">
				<button
					className="min-h-11 shrink-0 rounded border px-3"
					onClick={() =>
						props.onToolChange({
							kind: "measure",
							measure: { kind: "path", points: [] },
						})
					}
					type="button"
				>
					Measure path
				</button>
				<button
					className="min-h-11 shrink-0 rounded border px-3"
					onClick={() =>
						props.onToolChange({
							kind: "measure",
							measure: { kind: "radius", center: null, radiusMeters: 500 },
						})
					}
					type="button"
				>
					Measure radius
				</button>
				<button
					className="min-h-11 shrink-0 rounded border px-3"
					onClick={() => props.onToolChange({ kind: "placingPin" })}
					type="button"
				>
					Drop pin
				</button>
				{props.canPlaceZone && (
					<button
						className="min-h-11 shrink-0 rounded border px-3"
						onClick={() =>
							props.onToolChange({
								kind: "placingZone",
								center: null,
								radiusMeters: 500,
								stopId: null,
							})
						}
						type="button"
					>
						Search zone
					</button>
				)}
				{props.canEditConstraints && (
					<>
						<button
							className="min-h-11 shrink-0 rounded border px-3"
							data-testid="add-radius-constraint"
							onClick={() =>
								props.onToolChange({
									kind: "drawingRadiusConstraint",
									center: null,
									radiusMeters: 500,
								})
							}
							type="button"
						>
							Inside this radius
						</button>
						<button
							className="min-h-11 shrink-0 rounded border px-3"
							data-testid="add-polygon-constraint"
							onClick={() =>
								props.onToolChange({
									kind: "drawingPolygonConstraint",
									ring: [],
								})
							}
							type="button"
						>
							Inside this shape
						</button>
						<button
							className="min-h-11 shrink-0 rounded border px-3"
							data-testid="add-bezirk-constraint"
							onClick={() =>
								props.onToolChange({
									kind: "pickingBoundaryConstraint",
									adminLevel: 9,
									selectedId: null,
								})
							}
							type="button"
						>
							Bezirk
						</button>
						<button
							className="min-h-11 shrink-0 rounded border px-3"
							data-testid="add-ortsteil-constraint"
							onClick={() =>
								props.onToolChange({
									kind: "pickingBoundaryConstraint",
									adminLevel: 10,
									selectedId: null,
								})
							}
							type="button"
						>
							Ortsteil
						</button>
						<button
							className="min-h-11 shrink-0 rounded border px-3"
							data-testid="constraint-list"
							onClick={() => props.onToolChange({ kind: "listingConstraints" })}
							type="button"
						>
							Constraints
						</button>
					</>
				)}
			</div>
			<label className="block">
				<span className="sr-only">Search places or coordinates</span>
				<input
					className="min-h-11 w-full rounded border px-3"
					data-testid="map-search"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search stops or coordinates"
					type="search"
					value={query}
				/>
			</label>
			{results.length > 0 && (
				<ul className="mt-2 max-h-48 overflow-y-auto">
					{results.map((result, index) => (
						<li className="flex gap-1" key={searchKey(result)}>
							<button
								className="min-h-11 flex-1 rounded px-2 text-left hover:bg-muted"
								onClick={() => props.onSearchResult(result)}
								type="button"
							>
								{searchLabel(result)}
								{result.kind === "stop" &&
									!result.stop.insideArea &&
									" · outside the area"}
							</button>
							{result.kind === "stop" && props.canPlaceZone && (
								<button
									aria-label={`Mark zone at ${result.stop.name}`}
									className="min-h-11 rounded border px-2"
									onClick={() => props.onSearchStopZone(result.stop)}
									type="button"
								>
									Zone
								</button>
							)}
							{index === 0 && result.kind === "coordinate" && (
								<span className="self-center text-xs">
									{result.parsed.swapped ? "lng/lat swapped" : "lat/lng"}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function MeasureSheet(props: MapToolSheetProps) {
	if (props.tool.kind !== "measure") return null;
	const measure = props.tool.measure;
	const segments = measure.kind === "path" ? pathSegments(measure.points) : [];
	const total = segments.reduce((sum, segment) => sum + segment, 0);
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex items-center justify-between">
				<strong>
					{measure.kind === "path" ? "Measure path" : "Measure radius"}
				</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
			<p className="font-semibold text-xl" data-testid="measure-total">
				{formatDistance(measure.kind === "path" ? total : measure.radiusMeters)}
			</p>
			{measure.kind === "path" ? (
				<div className="flex flex-wrap gap-2">
					<button
						className="min-h-11 rounded border px-3"
						disabled={measure.points.length === 0}
						onClick={props.onUndoMeasure}
						type="button"
					>
						Undo last point
					</button>
					{measure.points.length === 0 && (
						<button
							className="min-h-11 rounded border px-3"
							onClick={props.onSeedMeasure}
							type="button"
						>
							From my position
						</button>
					)}
					{segments.map((segment, index) => (
						<span
							className="rounded bg-muted px-2 py-1 text-sm"
							key={`${measure.points[index]?.join(",")}:${measure.points[index + 1]?.join(",")}`}
						>
							{index + 1}: {formatDistance(segment)}
						</span>
					))}
				</div>
			) : (
				<div className="flex flex-wrap gap-2">
					{[100, 250, 500, 1_000, 2_000].map((radius) => (
						<button
							className="min-h-11 rounded border px-3"
							key={radius}
							onClick={() =>
								props.onToolChange({
									kind: "measure",
									measure: { ...measure, radiusMeters: radius },
								})
							}
							type="button"
						>
							{formatDistance(radius)}
						</button>
					))}
					{measure.center && (
						<button
							className="min-h-11 rounded border px-3"
							onClick={() => props.onToolChange({ kind: "placingPin" })}
							type="button"
						>
							Keep as pin
						</button>
					)}
				</div>
			)}
		</section>
	);
}

function PinForm(props: MapToolSheetProps) {
	const pin = props.editingPin;
	const [label, setLabel] = useState(pin?.label ?? "");
	const [note, setNote] = useState(pin?.note ?? "");
	const [color, setColor] = useState(pin?.color ?? props.teamColor);
	const radius =
		props.tool.kind === "placingPin" && props.draftPoint
			? null
			: (pin?.radiusMeters ?? null);
	return (
		<form
			className="pointer-events-auto space-y-2 rounded bg-background/95 p-3 shadow"
			onSubmit={(event) => {
				event.preventDefault();
				props.onSavePin({ label, note, color, radiusMeters: radius });
			}}
		>
			<div className="flex items-center justify-between">
				<strong>{pin ? "Edit pin" : "New pin"}</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
			<input
				className="min-h-11 w-full rounded border px-3"
				maxLength={80}
				onChange={(event) => setLabel(event.target.value)}
				placeholder="Label (optional)"
				value={label}
			/>
			<textarea
				className="min-h-20 w-full rounded border p-3"
				onChange={(event) => setNote(event.target.value)}
				placeholder="Team note"
				value={note}
			/>
			<div className="flex gap-2">
				{TEAM_COLORS.map((choice) => (
					<button
						aria-label={`Use ${choice}`}
						className={`size-11 rounded-full border-4 ${choice === color ? "border-foreground" : "border-transparent"}`}
						key={choice}
						onClick={() => setColor(choice)}
						style={{ backgroundColor: choice }}
						type="button"
					/>
				))}
			</div>
			<div className="flex gap-2">
				<button className="min-h-11 rounded border px-4" type="submit">
					Save
				</button>
				{pin && (
					<button
						className="min-h-11 rounded border px-4"
						onClick={props.onDeletePin}
						type="button"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	);
}

function ZoneForm(props: MapToolSheetProps) {
	const [note, setNote] = useState("");
	if (props.tool.kind !== "placingZone") return null;
	const zone = props.tool;
	return (
		<form
			className="pointer-events-auto space-y-2 rounded bg-background/95 p-3 shadow"
			onSubmit={(event) => {
				event.preventDefault();
				props.onSaveZone(note);
			}}
		>
			<div className="flex items-center justify-between">
				<strong>Suspected search zone</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
			<p>{formatDistance(props.tool.radiusMeters)} radius</p>
			<div className="flex flex-wrap gap-2">
				{[100, 250, 500, 1_000, 2_000].map((radius) => (
					<button
						className="min-h-11 rounded border px-3"
						key={radius}
						onClick={() =>
							props.onToolChange({ ...zone, radiusMeters: radius })
						}
						type="button"
					>
						{formatDistance(radius)}
					</button>
				))}
			</div>
			<textarea
				className="min-h-20 w-full rounded border p-3"
				onChange={(event) => setNote(event.target.value)}
				placeholder="Team note"
				value={note}
			/>
			<div className="flex gap-2">
				<button className="min-h-11 rounded border px-4" type="submit">
					Declare zone
				</button>
				<button
					className="min-h-11 rounded border px-4"
					onClick={props.onClearZone}
					type="button"
				>
					Clear existing
				</button>
			</div>
		</form>
	);
}

function ActivePrompt({
	name,
	onCancel,
}: {
	readonly name: string;
	readonly onCancel: () => void;
}) {
	return (
		<div className="pointer-events-auto flex items-center justify-between rounded bg-background/95 p-3 shadow">
			<strong>{name}: tap the map</strong>
			<button className="min-h-11 px-3" onClick={onCancel} type="button">
				Cancel
			</button>
		</div>
	);
}

function ConstraintConfirmSheet(props: MapToolSheetProps) {
	const vertexCount =
		props.tool.kind === "drawingPolygonConstraint"
			? props.tool.ring.length
			: null;
	let suggestedName = "";
	if (props.tool.kind === "pickingBoundaryConstraint") {
		const id = props.tool.selectedId;
		suggestedName = props.boundaries.find((row) => row.id === id)?.name ?? "";
	}
	const [name, setName] = useState(suggestedName);
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex items-center justify-between">
				<strong>They are…</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
			{vertexCount !== null && (
				<p className="text-sm">
					<span data-testid="constraint-vertex-count">{vertexCount}</span>{" "}
					points
				</p>
			)}
			<label className="mt-2 block">
				<span className="sr-only">Constraint name</span>
				<input
					className="min-h-11 w-full rounded border px-3"
					data-testid="constraint-name"
					maxLength={80}
					onChange={(event) => setName(event.target.value)}
					placeholder="Name (optional)"
					value={name}
				/>
			</label>
			<div className="mt-2 flex flex-wrap gap-2">
				<button
					className="min-h-11 rounded border px-3"
					data-testid="they-are-inside"
					onClick={() => props.onCommitConstraint("include", name)}
					type="button"
				>
					They are inside this
				</button>
				<button
					className="min-h-11 rounded border px-3"
					data-testid="they-are-outside"
					onClick={() => props.onCommitConstraint("exclude", name)}
					type="button"
				>
					They are outside this
				</button>
				{props.tool.kind === "drawingPolygonConstraint" && (
					<button
						className="min-h-11 rounded border px-3"
						disabled={props.tool.ring.length === 0}
						onClick={props.onUndoPolygonVertex}
						type="button"
					>
						Undo last point
					</button>
				)}
				{props.tool.kind === "pickingBoundaryConstraint" && (
					<button
						className="min-h-11 rounded border px-3"
						onClick={() => props.onSelectBoundary(null)}
						type="button"
					>
						Pick another
					</button>
				)}
			</div>
		</section>
	);
}

function boundarySlug(name: string): string {
	return name
		.toLocaleLowerCase("de")
		.replaceAll("ä", "ae")
		.replaceAll("ö", "oe")
		.replaceAll("ü", "ue")
		.replaceAll("ß", "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function BoundaryPickerSheet(props: MapToolSheetProps) {
	const [query, setQuery] = useState("");
	if (props.tool.kind !== "pickingBoundaryConstraint") return null;
	const title = props.tool.adminLevel === 9 ? "Bezirk" : "Ortsteil";
	const folded = query.trim().toLocaleLowerCase("de");
	const rows = folded
		? props.boundaries.filter((row) =>
				row.name.toLocaleLowerCase("de").includes(folded),
			)
		: props.boundaries;
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex items-center justify-between">
				<strong>{title}</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
			<p className="text-sm">Tap the map or pick from the list.</p>
			<label className="mt-2 block">
				<span className="sr-only">Search {title}</span>
				<input
					className="min-h-11 w-full rounded border px-3"
					data-testid="boundary-search"
					onChange={(event) => setQuery(event.target.value)}
					placeholder={`Search ${title}`}
					type="search"
					value={query}
				/>
			</label>
			{rows.length === 0 ? (
				<p className="mt-2 text-sm">None in view.</p>
			) : (
				<ul className="mt-2 max-h-48 overflow-y-auto">
					{rows.map((row) => (
						<li key={row.id}>
							<button
								className="min-h-11 w-full rounded px-2 text-left hover:bg-muted"
								data-testid={`boundary-${row.adminLevel}-${boundarySlug(row.name)}`}
								onClick={() => props.onSelectBoundary(row.id)}
								type="button"
							>
								{row.name}
								<span className="ml-2 text-xs">{row.label}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function PolygonConstraintPrompt(props: MapToolSheetProps) {
	const count =
		props.tool.kind === "drawingPolygonConstraint" ? props.tool.ring.length : 0;
	return (
		<div className="pointer-events-auto flex items-center justify-between gap-2 rounded bg-background/95 p-3 shadow">
			<strong>
				Tap to add, tap an edge to insert
				<span
					className="ml-2 font-normal text-sm"
					data-testid="constraint-vertex-count"
				>
					{count}
				</span>
			</strong>
			<div className="flex gap-2">
				<button
					className="min-h-11 rounded border px-3"
					disabled={count === 0}
					onClick={props.onUndoPolygonVertex}
					type="button"
				>
					Undo
				</button>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

function ConstraintListSheet(props: MapToolSheetProps) {
	return (
		<section className="pointer-events-auto rounded bg-background/95 p-3 shadow">
			<div className="flex items-center justify-between">
				<strong>Constraints</strong>
				<button
					className="min-h-11 px-3"
					onClick={props.onCancel}
					type="button"
				>
					Done
				</button>
			</div>
			{props.constraints.length === 0 ? (
				<p className="text-sm">None yet.</p>
			) : (
				<ul className="mt-2 space-y-2">
					{props.constraints.map((row) => (
						<li
							className="flex items-center gap-2"
							data-testid={`constraint-${row.id}`}
							key={row.id}
						>
							<label className="flex-1">
								<span className="sr-only">Constraint name</span>
								<input
									className="min-h-11 w-full rounded border px-2 text-sm"
									data-testid={`constraint-name-${row.id}`}
									defaultValue={row.name ?? ""}
									key={`${row.id}:${row.name ?? ""}`}
									maxLength={80}
									onBlur={(event) => {
										const next = event.target.value.trim();
										if (next !== (row.name ?? "")) {
											props.onRenameConstraint(row.id, next);
										}
									}}
									placeholder={`${row.kind} · ${row.mode}`}
								/>
							</label>
							<span className="text-sm">
								{row.mode}
								{row.source === "answer" ? " · from an answer" : ""}
								{row.enabled ? "" : " · off"}
							</span>
							<button
								className="min-h-11 rounded border px-3"
								data-testid={`toggle-constraint-${row.id}`}
								onClick={() => props.onToggleConstraint(row.id, !row.enabled)}
								type="button"
							>
								{row.enabled ? "Disable" : "Enable"}
							</button>
							{row.source === "manual" && (
								<button
									className="min-h-11 rounded border px-3"
									data-testid={`remove-constraint-${row.id}`}
									onClick={() => props.onRemoveConstraint(row.id)}
									type="button"
								>
									Delete
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function toolName(tool: MapTool): string {
	if (tool.kind === "placingPin") return "Drop pin";
	if (tool.kind === "placingZone") return "Search zone";
	if (tool.kind === "editingPin") return "Edit pin";
	if (tool.kind === "measure") return "Measure";
	if (tool.kind === "drawingRadiusConstraint") return "Radius constraint";
	if (tool.kind === "drawingPolygonConstraint") return "Shape constraint";
	if (tool.kind === "pickingBoundaryConstraint") {
		return tool.adminLevel === 9 ? "Bezirk" : "Ortsteil";
	}
	if (tool.kind === "listingConstraints") return "Constraints";
	return "Map";
}

function searchKey(result: SearchResult): string {
	if (result.kind === "coordinate")
		return formatCoordinates(result.parsed.point);
	return `stop:${result.stop.stopId}`;
}

function searchLabel(result: SearchResult): string {
	if (result.kind === "coordinate") {
		return `${formatCoordinates(result.parsed.point)} — fly there and drop pin`;
	}
	return result.stop.name;
}

export function CoordinateCopy({ point }: { readonly point: LngLat }) {
	const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");
	const text = formatCoordinates(point);
	const available = webPlatform.clipboard.capability().available;
	return (
		<div className="flex items-center gap-2">
			<span className="select-all">{text}</span>
			{available ? (
				<button
					className="min-h-11 rounded border px-2"
					onClick={() =>
						void webPlatform.clipboard
							.write(text)
							.then((success) => setCopied(success ? "yes" : "no"))
					}
					type="button"
				>
					{copied === "yes"
						? "Copied"
						: copied === "no"
							? "Copy failed"
							: "Copy"}
				</button>
			) : (
				<span>Select and copy</span>
			)}
		</div>
	);
}
