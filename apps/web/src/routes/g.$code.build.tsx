import { useQuery } from "@rocicorp/zero/react";
import { materialiseStops, SCALE_SETTINGS } from "@zero-lag/catalog";
import {
	type BBox,
	type LngLat,
	multiPolygonBBox,
	multiPolygonToRegion,
	offsetLngLat,
} from "@zero-lag/geo";
import { queries } from "@zero-lag/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
	applyMap,
	type CatalogStopRow,
	fetchCatalogStops,
	saveTemplate,
} from "../builder/api";
import { DrawPanel } from "../builder/draw-panel";
import { ReadoutBar } from "../builder/readout-bar";
import { SaveSheet, type SaveState } from "../builder/save-sheet";
import { useBuilder } from "../builder/use-builder";
import { useGameShell } from "../game/shell";
import { AreaLayer } from "../map/area-layer";
import { BuilderStopsLayer } from "../map/builder-stops-layer";
import { DrawLayer } from "../map/draw-layer";
import { MapCanvas, type MapStatus } from "../map/map-canvas";
import { MapTapHandler } from "../map/map-interactions";
import type { SearchableStop } from "../map/toolkit";
import { MapViewportReporter } from "../map/viewport-reporter";

const FALLBACK_CENTER: LngLat = [13.4132, 52.5219];

/**
 * The game area builder. m4-spec §9.
 *
 * Reachable from the lobby by anyone wearing the host hat, and deliberately not
 * from the map: the map is the playing surface and m3-spec §9 fought for every
 * pixel of it.
 *
 * Field-hostile is a weaker requirement here than anywhere else in the app.
 * Nobody draws a game area in the rain with 8% battery; they do it on a sofa
 * the night before. 44 px targets and one-handed reach still apply to the
 * readouts and the save, which a host does check on a platform.
 */
export default function BuildRoute() {
	const { session } = useGameShell();
	const [games] = useQuery(queries.game());
	const [rounds] = useQuery(queries.rounds());
	const [status, setStatus] = useState<MapStatus>("loading");
	const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

	const builder = useBuilder();
	const config = games[0]?.mapConfig;
	const roundRunning = rounds.some(
		(round) => round.status === "hiding" || round.status === "seeking",
	);

	const initialBounds = useMemo<BBox | null>(() => {
		const area = config?.validHidingArea;
		if (!area || area.length === 0) return null;
		let minLng = 180;
		let minLat = 90;
		let maxLng = -180;
		let maxLat = -90;
		for (const polygon of area) {
			for (const [lng, lat] of polygon[0] ?? []) {
				minLng = Math.min(minLng, lng);
				minLat = Math.min(minLat, lat);
				maxLng = Math.max(maxLng, lng);
				maxLat = Math.max(maxLat, lat);
			}
		}
		return [minLng, minLat, maxLng, maxLat];
	}, [config?.validHidingArea]);

	const [viewBounds, setViewBounds] = useState<BBox | null>(null);

	/**
	 * The catalog read follows the *area* once there is one, and the viewport
	 * only before that.
	 *
	 * Reading the viewport throughout would make the station count depend on how
	 * far the host happened to be zoomed in, which is a readout that lies. The
	 * area plus its materialisation margin is exactly the set the map would
	 * carry, so what the readout counts is what applying would produce.
	 */
	const requestBounds = useMemo<BBox | null>(() => {
		if (!builder.area) return viewBounds;
		const bbox = multiPolygonBBox(builder.area);
		if (!bbox) return viewBounds;
		const margin = SCALE_SETTINGS[builder.scalePreset].marginMeters;
		const sw = offsetLngLat([bbox[0], bbox[1]], -margin, -margin);
		const ne = offsetLngLat([bbox[2], bbox[3]], margin, margin);
		return [sw[0], sw[1], ne[0], ne[1]];
	}, [builder.area, builder.scalePreset, viewBounds]);

	const catalog = useCatalogStops(session, requestBounds);
	const catalogStops = catalog.stops;

	/**
	 * Which of the stops in view the map would carry, recomputed on every render
	 * rather than stored. A polygon needs no worker, no debounce and no
	 * bucketing to do this — which is the clearest measure of what removing the
	 * union bought. m4-spec §5.
	 */
	const preview = useMemo<readonly SearchableStop[]>(() => {
		if (!builder.area) {
			return catalogStops.map((stop) => toSearchable(stop, false));
		}
		const margin = SCALE_SETTINGS[builder.scalePreset].marginMeters;
		return materialiseStops(
			catalogStops.map((stop) => ({ ...stop, modeIds: [...stop.modeIds] })),
			multiPolygonToRegion(builder.area),
			margin,
		);
	}, [catalogStops, builder.area, builder.scalePreset]);

	const insideCount = preview.filter((stop) => stop.insideArea).length;
	const modes = useMemo(() => {
		const found = new Set<string>();
		for (const stop of preview) {
			if (!stop.insideArea) continue;
			for (const mode of stop.modeIds) found.add(mode);
		}
		return [...found].sort();
	}, [preview]);

	const draft = {
		name: builder.state.name.trim(),
		scalePreset: builder.scalePreset,
		ring: builder.state.ring,
		hidingRadiusMeters: builder.hidingRadiusMeters,
	};

	async function save() {
		setSaveState({ kind: "saving" });
		try {
			const { code } = await saveTemplate(session, draft);
			setSaveState({ kind: "saved", code });
		} catch (error) {
			setSaveState({ kind: "failed", message: (error as Error).message });
		}
	}

	async function apply() {
		setSaveState({ kind: "applying" });
		try {
			const result = await applyMap(session, draft);
			setSaveState({
				kind: "applied",
				stopCount: result.stopCount,
				catalogVersionChanged: result.catalogVersionChanged,
			});
		} catch (error) {
			setSaveState({ kind: "failed", message: (error as Error).message });
		}
	}

	return (
		<main className="relative h-dvh w-full">
			<MapCanvas
				initialBounds={initialBounds}
				initialCenter={FALLBACK_CENTER}
				onStatusChange={setStatus}
			>
				<AreaLayer area={builder.area} />
				<BuilderStopsLayer stops={preview} />
				<DrawLayer ring={builder.state.ring} />
				<MapViewportReporter onSettle={setViewBounds} />
				{builder.state.drawing && <MapTapHandler onTap={builder.addVertex} />}
			</MapCanvas>

			{/* The map object exists a beat before React mounts the tap handler as
			    its child, so ".maplibregl-canvas" is not proof that a tap will be
			    heard. This is. */}
			{status === "ready" && (
				<span className="sr-only" data-testid="builder-map-ready" />
			)}

			{status === "unavailable" && (
				<p
					className="absolute inset-x-0 top-0 z-20 p-3"
					data-testid="map-unavailable"
				>
					The map could not load. Drawing needs it.
				</p>
			)}

			<div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
				<Link
					className="pointer-events-auto min-h-11 rounded bg-background/95 px-3 py-2 shadow"
					data-testid="build-back"
					to={`/g/${session.code}`}
				>
					Back
				</Link>
				<ReadoutBar
					areaSquareMeters={builder.areaSquareMeters}
					insideCount={insideCount}
					modes={modes}
					stationCount={preview.length}
					truncated={catalog.truncated}
				/>
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-xl space-y-2 p-3">
				<DrawPanel
					drawing={builder.state.drawing}
					onClear={builder.clear}
					onToggleDrawing={() => builder.setDrawing(!builder.state.drawing)}
					onUndo={builder.undoVertex}
					vertexCount={builder.state.ring.length}
				/>
				<SaveSheet
					canSave={builder.canSave}
					hidingRadiusMeters={builder.hidingRadiusMeters}
					name={builder.state.name}
					onApply={apply}
					onName={builder.setName}
					onPreset={builder.setPreset}
					onRadius={builder.setRadius}
					onSave={save}
					roundRunning={roundRunning}
					scalePreset={builder.scalePreset}
					state={saveState}
					suggestedPreset={builder.suggestedPreset}
				/>
			</div>
		</main>
	);
}

function toSearchable(
	stop: CatalogStopRow,
	insideArea: boolean,
): SearchableStop {
	return {
		stopId: stop.id,
		name: stop.name,
		lng: stop.lng,
		lat: stop.lat,
		modeIds: stop.modeIds,
		insideArea,
	};
}

/**
 * The one screen in the app that talks to the catalog, debounced on map idle
 * rather than on every frame — not for compute, which is trivial, but because
 * it is a network call. m4-spec §9.
 */
interface CatalogView {
	readonly stops: readonly CatalogStopRow[];
	readonly truncated: boolean;
}

const NO_STOPS: CatalogView = { stops: [], truncated: false };

function useCatalogStops(
	session: ReturnType<typeof useGameShell>["session"],
	bounds: BBox | null,
): CatalogView {
	const [view, setView] = useState<CatalogView>(NO_STOPS);

	/**
	 * Rounded to decide *whether* to refetch — three decimals is about 70 m of
	 * longitude here, so a one-metre pan is not a new request — but the exact
	 * box is what gets sent.
	 *
	 * Sending the rounded box instead made the readout disagree with the server
	 * by a handful of stops sitting within 70 m of the boundary, which is a
	 * preview that lies about the thing it is previewing.
	 */
	const exact = useRef(bounds);
	exact.current = bounds;
	const key = bounds ? bounds.map((n) => n.toFixed(3)).join(",") : null;

	useEffect(() => {
		const bbox = exact.current;
		if (!key || !bbox) return;
		let live = true;
		fetchCatalogStops(session, bbox)
			.then((result) => {
				if (live) setView({ stops: result.stops, truncated: result.truncated });
			})
			.catch(() => {
				if (live) setView(NO_STOPS);
			});
		return () => {
			live = false;
		};
	}, [key, session]);

	return view;
}
