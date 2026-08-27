import type { CatalogAdminLevel } from "@zero-lag/catalog";
import {
	type BBox,
	multiPolygonBBox,
	multiPolygonToRegion,
	regionArea,
} from "@zero-lag/geo";
import type { AreaPieceSource } from "@zero-lag/schema";
import { Chip } from "@zero-lag/ui/components/chip";
import { Field } from "@zero-lag/ui/components/field";
import {
	ToggleButton,
	ToggleStrip,
} from "@zero-lag/ui/components/toggle-button";
import { cn } from "@zero-lag/ui/lib/utils";
import { useMemo, useState } from "react";
import { formatArea } from "../builder/use-builder";
import { useGameShell } from "../game/shell";
import { MapIdleBounds } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { EditorScreen } from "../setup/area/editor-screen";
import { GERMANY_BOUNDS } from "../setup/area/labels";
import { FoldLayer, PreviewLayer } from "../setup/area/layers";
import { useAreaToolNav } from "../setup/area/tool-nav";
import { useBoundarySearch } from "../setup/area/use-boundary-search";
import { useAreaEditor } from "../setup/area/use-editor";

type PlaceFilter = "land" | "district" | "ortsteil";

const FILTERS: Record<
	PlaceFilter,
	{
		label: string;
		adminLevel: CatalogAdminLevel;
		source: AreaPieceSource;
	}
> = {
	land: { label: "Länder", adminLevel: 4, source: "city" },
	district: { label: "District", adminLevel: 9, source: "district" },
	ortsteil: { label: "Ortsteil", adminLevel: 10, source: "district" },
};

const FILTER_IDS = [
	"land",
	"district",
	"ortsteil",
] as const satisfies PlaceFilter[];

/** Below this, the map is the whole country and is not a useful search filter. */
const VIEW_FILTER_ZOOM = 9;

export default function SetupAreaDistricts() {
	const { session } = useGameShell();
	const editor = useAreaEditor();
	const nav = useAreaToolNav();
	const [filters, setFilters] = useState<Record<PlaceFilter, boolean>>({
		land: true,
		district: true,
		ortsteil: true,
	});
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [view, setView] = useState<{ bbox: BBox; zoom: number } | null>(null);
	const levels = useMemo(
		() =>
			FILTER_IDS.filter((id) => filters[id]).map(
				(id) => FILTERS[id].adminLevel,
			),
		[filters],
	);
	const viewBbox = view && view.zoom >= VIEW_FILTER_ZOOM ? view.bbox : null;
	const search = useBoundarySearch(session, levels, query, viewBbox);
	const selected = search.rows.find((row) => row.id === selectedId) ?? null;
	const op = editor.cut ? "subtract" : "add";

	function commit() {
		if (!selected) return;
		const filter = FILTER_IDS.find(
			(id) => FILTERS[id].adminLevel === selected.adminLevel,
		);
		if (!filter) return;
		editor.addGeometry({
			source: FILTERS[filter].source,
			name: selected.name,
			geometry: selected.polygons,
		});
		nav.afterCommit();
	}

	function toggle(id: PlaceFilter) {
		setFilters((current) => ({ ...current, [id]: !current[id] }));
		setSelectedId(null);
	}

	return (
		<EditorScreen
			actionDisabled={!selected}
			actionLabel={
				selected
					? editor.cut
						? `Take out ${selected.name}`
						: `Add ${selected.name}`
					: "Pick a place"
			}
			actionTestId="area-district-add"
			bodyClassName="overflow-hidden"
			onAction={commit}
			showAddCut
			title={editor.cut ? "Take out a place" : "Add a place"}
		>
			<EditorMap
				bounds={multiPolygonBBox(editor.foldMulti) ?? GERMANY_BOUNDS}
				className="h-[18rem] shrink-0 rounded-[18px] border border-hairline"
				fitPadding={12}
			>
				<FoldLayer area={editor.foldMulti} />
				{selected && <PreviewLayer geometry={selected.polygons} op={op} />}
				<MapIdleBounds onIdle={setView} />
			</EditorMap>
			<div className="shrink-0">
				<Field
					autoCapitalize="words"
					autoComplete="off"
					data-testid="area-place-search"
					label="Find a place"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Berlin, Mitte, Schwabing…"
					type="search"
					value={query}
				/>
			</div>
			{/* Many at once: this is a filter over the catalogue, not a tool. */}
			<ToggleStrip className="shrink-0" testId="area-boundary-tabs">
				{FILTER_IDS.map((id) => (
					<ToggleButton
						key={id}
						onClick={() => toggle(id)}
						pressed={filters[id]}
						shape="bar"
						testId={`area-boundary-tab-${id}`}
					>
						{FILTERS[id].label}
					</ToggleButton>
				))}
			</ToggleStrip>
			{search.truncated && search.rows.length > 0 && (
				<p className="eyebrow shrink-0 px-1 text-ink-dim">
					Showing {search.rows.length} of {search.total.toLocaleString("en")}.
					Zoom the map or keep typing.
				</p>
			)}
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
				{search.ready && search.rows.length === 0 && (
					<p className="px-1 text-ink-dim text-sm leading-snug">
						{levels.length === 0
							? "Turn a kind on to search it."
							: query.trim()
								? `Nothing named “${query.trim()}”.`
								: viewBbox
									? "Nothing in this view. Pan the map or type a name."
									: `Type a name, or zoom the map. ${search.total.toLocaleString("en")} in the catalog.`}
					</p>
				)}
				{search.rows.map((row) => {
					const region = multiPolygonToRegion(row.polygons);
					const on = row.id === selectedId;
					return (
						<button
							className={cn(
								"flex w-full shrink-0 items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left",
								on ? "border-action" : "border-hairline",
							)}
							data-testid={`area-district-${row.name}`}
							key={row.id}
							onClick={() => setSelectedId(row.id)}
							type="button"
						>
							<span className="min-w-0 flex-1">
								<b className="block text-[0.85rem] leading-tight">{row.name}</b>
								<span className="eyebrow mt-0.5 block text-ink-dim">
									{row.label} · {formatArea(regionArea(region))}
								</span>
							</span>
							{on ? (
								<Chip tone={editor.cut ? "offline" : "live"}>
									{editor.cut ? "Taking out" : "Adding"}
								</Chip>
							) : (
								<span className="eyebrow shrink-0 text-ink-dim">
									{editor.cut ? "Take out" : "Add"}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</EditorScreen>
	);
}
