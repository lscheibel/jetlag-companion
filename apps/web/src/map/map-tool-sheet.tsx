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
import { defaultClosestPoiRadius, type MapPoi } from "./poi";
import { type PoiTypeId, poiTypeLabel } from "./poi-type";
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
	/** Origin is the GPS fix, so search distances are "from you". */
	readonly fromYou: boolean;
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
	readonly pois: readonly MapPoi[];
	/** Every type a pin can be on this board: station types, then amenities. */
	readonly poiTypes: readonly PoiTypeId[];
}

export function MapToolSheet(props: MapToolSheetProps) {
	const searching = props.tool.kind === "searching";
	const zoneOpen =
		props.tool.kind === "placingZone" && props.tool.center !== null;
	const picking =
		props.tool.kind === "pickingBoundaryConstraint" && !props.tool.selectedId;
	const pickingClosest =
		props.tool.kind === "pickingClosestPoiConstraint" && !props.tool.selectedId;
	const pickingRadiusKind =
		props.tool.kind === "drawingRadiusConstraint" && props.tool.pickingKind;

	return (
		<>
			<SearchSheet {...props} open={searching} />
			<ZoneForm {...props} open={zoneOpen} />
			<BoundaryPickerSheet {...props} open={picking} />
			<ClosestPoiPickerSheet {...props} open={pickingClosest} />
			<RadiusPoiKindSheet {...props} open={pickingRadiusKind} />
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
								{searchLabel(result, props.fromYou)}
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

function ClosestPoiPickerSheet(
	props: MapToolSheetProps & { readonly open: boolean },
) {
	const [query, setQuery] = useState("");
	const picking =
		props.tool.kind === "pickingClosestPoiConstraint" ? props.tool : null;
	const filterKind = picking?.filterKind ?? null;
	const folded = query.trim().toLocaleLowerCase("de");
	const kindCounts = poiTypeCounts(props.poiTypes, props.pois);
	const matches = props.pois.filter((poi) => {
		if (!filterKind || poi.kind !== filterKind || !poi.insideArea) return false;
		if (!folded) return true;
		return poi.name.toLocaleLowerCase("de").includes(folded);
	});
	// A city carries thousands of bus stops. The list is a way in, not an
	// inventory: the rest are reached by name, or by tapping the dot.
	const rows = matches.slice(0, PICK_LIST_LIMIT);

	function selectKind(kind: PoiTypeId) {
		if (!picking) return;
		props.onToolChange({
			...picking,
			filterKind: kind,
			selectedId: null,
		});
	}

	function selectPoi(poi: MapPoi) {
		if (!picking) return;
		const from = props.fromYou ? props.origin : null;
		props.onToolChange({
			...picking,
			filterKind: poi.kind,
			selectedId: poi.id,
			radiusMeters: defaultClosestPoiRadius(from, poi.lng, poi.lat),
		});
	}

	return (
		<Sheet
			onClose={props.onCancel}
			open={props.open}
			testId="closest-poi-sheet"
			title="Pick a point of interest"
		>
			{filterKind === null ? (
				<div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
					{kindCounts.map(({ kind, count }) => (
						<button
							className={cn(
								"flex w-full shrink-0 items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left",
								"border-hairline",
							)}
							data-testid={`closest-poi-kind-${kind}`}
							disabled={count === 0}
							key={kind}
							onClick={() => selectKind(kind)}
							type="button"
						>
							<span className="min-w-0 flex-1">
								<b className="block text-[0.85rem] leading-tight">
									{poiTypeLabel(kind)}
								</b>
								<span className="eyebrow mt-0.5 block text-ink-dim">
									{count === 0
										? "None in the game area"
										: `${count} in the game area`}
								</span>
							</span>
						</button>
					))}
				</div>
			) : (
				<>
					<ActionButton
						onClick={() => {
							if (!picking) return;
							props.onToolChange({
								...picking,
								filterKind: null,
								selectedId: null,
							});
						}}
						size="comfortable"
						tone="secondary"
					>
						All kinds
					</ActionButton>
					<Field
						data-testid="closest-poi-search"
						label="Find a place"
						onChange={(event) => setQuery(event.target.value)}
						placeholder={poiTypeLabel(filterKind)}
						type="search"
						value={query}
					/>
					{rows.length === 0 ? (
						<p className="text-ink-dim text-sm">
							{query.trim()
								? `Nothing named “${query.trim()}”.`
								: "None in the game area."}
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
										data-testid={`closest-poi-${poiSlug(row.name)}`}
										key={row.id}
										onClick={() => selectPoi(row)}
										type="button"
									>
										<span className="min-w-0 flex-1">
											<b className="block text-[0.85rem] leading-tight">
												{row.name}
											</b>
										</span>
										<span className="eyebrow text-ink-dim">
											{on ? "Picked" : "Nearest"}
										</span>
									</button>
								);
							})}
						</div>
					)}
					{matches.length > rows.length && (
						<p className="eyebrow text-ink-dim">
							{rows.length} of {matches.length} — search by name, or tap one on
							the map.
						</p>
					)}
				</>
			)}
		</Sheet>
	);
}

function RadiusPoiKindSheet(
	props: MapToolSheetProps & { readonly open: boolean },
) {
	const picking =
		props.tool.kind === "drawingRadiusConstraint" ? props.tool : null;
	const kindCounts = poiTypeCounts(props.poiTypes, props.pois);

	function selectKind(kind: PoiTypeId) {
		if (!picking) return;
		props.onToolChange({
			...picking,
			poiKind: kind,
			centers: [],
			pickingKind: false,
		});
	}

	return (
		<Sheet
			onClose={() => {
				if (!picking) {
					props.onCancel();
					return;
				}
				props.onToolChange({ ...picking, pickingKind: false });
			}}
			open={props.open}
			testId="radius-poi-kind-sheet"
			title="All of this type"
		>
			<div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
				{kindCounts.map(({ kind, count }) => (
					<button
						className={cn(
							"flex w-full shrink-0 items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left",
							picking?.poiKind === kind ? "border-action" : "border-hairline",
						)}
						data-testid={`radius-poi-kind-${kind}`}
						disabled={count === 0}
						key={kind}
						onClick={() => selectKind(kind)}
						type="button"
					>
						<span className="min-w-0 flex-1">
							<b className="block text-[0.85rem] leading-tight">
								{poiTypeLabel(kind)}
							</b>
							<span className="eyebrow mt-0.5 block text-ink-dim">
								{count === 0
									? "None in the game area"
									: `${count} in the game area`}
							</span>
						</span>
					</button>
				))}
			</div>
		</Sheet>
	);
}

/** How many of each type are in play, in the order the sheets list them. */
function poiTypeCounts(
	types: readonly PoiTypeId[],
	pois: readonly MapPoi[],
): readonly { readonly kind: PoiTypeId; readonly count: number }[] {
	const counts = new Map<string, number>();
	for (const poi of pois) {
		if (!poi.insideArea) continue;
		counts.set(poi.kind, (counts.get(poi.kind) ?? 0) + 1);
	}
	return types.map((kind) => ({ kind, count: counts.get(kind) ?? 0 }));
}

const PICK_LIST_LIMIT = 50;

function poiSlug(name: string): string {
	return name
		.toLocaleLowerCase("de")
		.replaceAll("ä", "ae")
		.replaceAll("ö", "oe")
		.replaceAll("ü", "ue")
		.replaceAll("ß", "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function searchKey(result: SearchResult): string {
	if (result.kind === "coordinate")
		return formatCoordinates(result.parsed.point);
	return `stop:${result.stop.stopId}`;
}

function searchLabel(result: SearchResult, fromYou: boolean): string {
	if (result.kind === "coordinate") {
		return `${formatCoordinates(result.parsed.point)} — fly there and drop pin`;
	}
	const distance = formatDistance(result.distance);
	return fromYou
		? `${result.stop.name} · ${distance} from you`
		: `${result.stop.name} · ${distance}`;
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
