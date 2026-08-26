import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Sheet } from "@zero-lag/ui/components/sheet";
import {
	ToggleButton,
	ToggleModePair,
} from "@zero-lag/ui/components/toggle-button";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import {
	type BoundaryListItem,
	formatCoordinates,
	formatDistance,
	type MapTool,
	type SearchableStop,
	type SearchResult,
	searchStops,
	toggleBoundaryLevel,
} from "./toolkit";

interface MapToolSheetProps {
	readonly tool: MapTool;
	readonly origin: LngLat;
	readonly canPlaceZone: boolean;
	/** The stops this game carries — what place search runs over. m4-spec §5. */
	readonly stops: readonly SearchableStop[];
	readonly onToolChange: (tool: MapTool) => void;
	readonly onCancel: () => void;
	readonly onSaveZone: (note: string) => void;
	readonly onClearZone: () => void;
	readonly onSearchResult: (result: SearchResult) => void;
	readonly onSearchStopZone: (stop: SearchableStop) => void;
	readonly boundaries: readonly BoundaryListItem[];
	readonly onSelectBoundary: (id: string | null) => void;
}

export function MapToolSheet(props: MapToolSheetProps) {
	const searching = props.tool.kind === "searching";
	const zoneOpen =
		props.tool.kind === "placingZone" && props.tool.center !== null;
	const picking =
		props.tool.kind === "pickingBoundaryConstraint" && !props.tool.selectedId;

	return (
		<>
			<SearchSheet {...props} open={searching} />
			<ZoneForm {...props} open={zoneOpen} />
			<BoundaryPickerSheet {...props} open={picking} />
		</>
	);
}

function SearchSheet(props: MapToolSheetProps & { readonly open: boolean }) {
	const [query, setQuery] = useState("");
	const results = searchStops(props.stops, query, props.origin).slice(0, 8);
	return (
		<Sheet
			onClose={props.onCancel}
			open={props.open}
			testId="map-search-sheet"
			title="Search"
		>
			<Field
				autoFocus
				data-testid="map-search"
				label="Stops or coordinates"
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Görlitzer Bahnhof"
				type="search"
				value={query}
			/>
			{results.length > 0 && (
				<ul className="max-h-64 overflow-y-auto">
					{results.map((result, index) => (
						<li className="flex gap-1" key={searchKey(result)}>
							<button
								className="min-h-11 flex-1 rounded-control px-2 text-left hover:bg-surface-raised"
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
									className="min-h-11 rounded-control border border-hairline px-2"
									onClick={() => props.onSearchStopZone(result.stop)}
									type="button"
								>
									Zone
								</button>
							)}
							{index === 0 && result.kind === "coordinate" && (
								<span className="self-center text-ink-dim text-xs">
									{result.parsed.swapped ? "lng/lat swapped" : "lat/lng"}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Sheet>
	);
}

function ZoneForm(props: MapToolSheetProps & { readonly open: boolean }) {
	const [note, setNote] = useState("");
	const zone = props.tool.kind === "placingZone" ? props.tool : null;
	return (
		<Sheet
			onClose={props.onCancel}
			open={props.open}
			testId="zone-sheet"
			title="Suspected search zone"
		>
			{zone && (
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						props.onSaveZone(note);
					}}
				>
					<p className="font-mono text-sm">
						{formatDistance(zone.radiusMeters)} radius
					</p>
					<div className="flex flex-wrap gap-2">
						{[100, 250, 500, 1_000, 2_000].map((radius) => (
							<button
								className="min-h-11 rounded-control border border-hairline px-3"
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
					<label className="flex min-h-22 flex-col gap-1 rounded-tile border-2 border-hairline-strong bg-surface px-3.5 py-2">
						<span className="eyebrow">Note</span>
						<textarea
							className="min-h-16 w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-faint"
							onChange={(event) => setNote(event.target.value)}
							placeholder="Team note"
							value={note}
						/>
					</label>
					<ActionButton type="submit">Declare zone</ActionButton>
					<ActionButton
						onClick={props.onClearZone}
						tone="secondary"
						type="button"
					>
						Clear existing
					</ActionButton>
				</form>
			)}
		</Sheet>
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

function BoundaryPickerSheet(
	props: MapToolSheetProps & { readonly open: boolean },
) {
	const [query, setQuery] = useState("");
	const picking =
		props.tool.kind === "pickingBoundaryConstraint" ? props.tool : null;
	const levels = picking?.levels ?? [9, 10];
	const folded = query.trim().toLocaleLowerCase("de");
	const rows = props.boundaries.filter((row) => {
		if (row.adminLevel !== 9 && row.adminLevel !== 10) return false;
		if (!levels.includes(row.adminLevel)) return false;
		if (!folded) return true;
		return row.name.toLocaleLowerCase("de").includes(folded);
	});
	return (
		<Sheet
			onClose={props.onCancel}
			open={props.open}
			testId="boundary-sheet"
			title="Pick a place"
		>
			{/* Many at once — a filter, not a tool: both halves can be lit. */}
			<ToggleModePair className="shrink-0" testId="boundary-filters">
				<ToggleButton
					onClick={() => {
						if (!picking) return;
						props.onToolChange({
							...picking,
							levels: toggleBoundaryLevel(picking.levels, 9),
							selectedId: null,
						});
					}}
					pressed={levels.includes(9)}
					shape="bar"
					testId="boundary-level-9"
				>
					Bezirk
				</ToggleButton>
				<ToggleButton
					onClick={() => {
						if (!picking) return;
						props.onToolChange({
							...picking,
							levels: toggleBoundaryLevel(picking.levels, 10),
							selectedId: null,
						});
					}}
					pressed={levels.includes(10)}
					shape="bar"
					testId="add-ortsteil-constraint"
				>
					Ortsteil
				</ToggleButton>
			</ToggleModePair>
			<Field
				data-testid="boundary-search"
				label="Find a place"
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Mitte, Prenzlauer Berg…"
				type="search"
				value={query}
			/>
			{rows.length === 0 ? (
				<p className="text-ink-dim text-sm">
					{levels.length === 0
						? "Turn a kind on to search it."
						: query.trim()
							? `Nothing named “${query.trim()}”.`
							: "None in view."}
				</p>
			) : (
				<div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
					{rows.map((row) => {
						const on = row.id === picking?.selectedId;
						return (
							<button
								className={cn(
									"flex w-full shrink-0 items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left",
									on ? "border-action" : "border-hairline",
								)}
								data-testid={`boundary-${row.adminLevel}-${boundarySlug(row.name)}`}
								key={row.id}
								onClick={() => props.onSelectBoundary(row.id)}
								type="button"
							>
								<span className="min-w-0 flex-1">
									<b className="block text-[0.85rem] leading-tight">
										{row.name}
									</b>
									<span className="eyebrow mt-0.5 block text-ink-dim">
										{row.label}
									</span>
								</span>
								<span className="eyebrow text-ink-dim">
									{on ? "Picked" : "Place"}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</Sheet>
	);
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
					className="min-h-11 rounded-control border border-hairline px-2"
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
