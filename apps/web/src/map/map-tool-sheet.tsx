import { BERLIN_VBB_PACK, type TransitStop } from "@zero-lag/area-packs";
import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { useState } from "react";
import { TEAM_COLORS } from "../lobby/palette";
import type { MapPin } from "./pin-layer";
import {
	formatCoordinates,
	formatDistance,
	type MapTool,
	pathSegments,
	type SearchResult,
	searchAreaPack,
} from "./toolkit";

interface MapToolSheetProps {
	readonly tool: MapTool;
	readonly origin: LngLat;
	readonly draftPoint: LngLat | null;
	readonly editingPin: MapPin | null;
	readonly teamColor: string;
	readonly canPlaceZone: boolean;
	readonly enabledStopIds: readonly string[];
	readonly onToolChange: (tool: MapTool) => void;
	readonly onCancel: () => void;
	readonly onUndoMeasure: () => void;
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
	readonly onSearchStopZone: (stop: TransitStop) => void;
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
	if (props.tool.kind !== "none") {
		return (
			<ActivePrompt name={toolName(props.tool)} onCancel={props.onCancel} />
		);
	}
	return <ToolMenu {...props} />;
}

function ToolMenu(props: MapToolSheetProps) {
	const [query, setQuery] = useState("");
	const results = searchAreaPack(BERLIN_VBB_PACK, query, props.origin).slice(
		0,
		8,
	);
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
			</div>
			<label className="block">
				<span className="sr-only">Search places or coordinates</span>
				<input
					className="min-h-11 w-full rounded border px-3"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search stops, lines, areas, coordinates"
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
									props.enabledStopIds.includes(result.stop.id) &&
									" · hiding stop"}
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

function toolName(tool: MapTool): string {
	if (tool.kind === "placingPin") return "Drop pin";
	if (tool.kind === "placingZone") return "Search zone";
	if (tool.kind === "editingPin") return "Edit pin";
	if (tool.kind === "measure") return "Measure";
	return "Map";
}

function searchKey(result: SearchResult): string {
	if (result.kind === "coordinate")
		return formatCoordinates(result.parsed.point);
	if (result.kind === "stop") return `stop:${result.stop.id}`;
	if (result.kind === "line") return `line:${result.line.id}`;
	return `boundary:${result.boundary.id}`;
}

function searchLabel(result: SearchResult): string {
	if (result.kind === "coordinate") {
		return `${formatCoordinates(result.parsed.point)} — fly there and drop pin`;
	}
	if (result.kind === "stop") return result.stop.name;
	if (result.kind === "line") return result.line.name;
	return result.boundary.name;
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
