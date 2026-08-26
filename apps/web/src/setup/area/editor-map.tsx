import type { BBox, LngLat } from "@zero-lag/geo";
import { cn } from "@zero-lag/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
import {
	MapCanvas,
	type MapStatus,
	useMapInstance,
} from "../../map/map-canvas";
import { BERLIN_CENTER } from "./labels";
import { FoldStopsLayer } from "./layers";
import { useAreaEditor } from "./use-editor";

interface EditorMapProps {
	readonly bounds: BBox | null;
	readonly center?: LngLat;
	readonly fitPadding?: number;
	/**
	 * Keep the camera when this map remounts (switching tools). The wizard
	 * preview passes false so a tiny map does not overwrite the editor view.
	 */
	readonly rememberView?: boolean;
	readonly className?: string;
	readonly children: ReactNode;
}

export function EditorMap({
	bounds,
	center = BERLIN_CENTER,
	fitPadding,
	rememberView = true,
	className,
	children,
}: EditorMapProps) {
	const editor = useAreaEditor();
	const [status, setStatus] = useState<MapStatus>("loading");
	const camera = rememberView ? editor.camera : null;

	return (
		<div
			className={cn("relative min-h-0 overflow-hidden bg-map-land", className)}
		>
			{editor.ready && (
				<MapCanvas
					fitPadding={fitPadding}
					initialBounds={bounds}
					initialCamera={camera}
					initialCenter={center}
					onStatusChange={setStatus}
				>
					<EditorStops />
					{children}
					{rememberView && <ViewMemory />}
				</MapCanvas>
			)}
			{status === "ready" && (
				<span className="sr-only" data-testid="area-editor-map-ready" />
			)}
			{status === "unavailable" && (
				<p className="absolute inset-x-0 top-0 z-20 p-3 text-ink-dim text-xs">
					The map could not load. The list still works.
				</p>
			)}
		</div>
	);
}

/** Catalog stops, painted the way the play map paints them. */
function EditorStops() {
	const editor = useAreaEditor();
	return (
		<FoldStopsLayer
			area={editor.empty ? null : editor.foldMulti}
			fold={editor.fold}
			inPlayModeIds={editor.inPlayModeIds}
			stops={editor.catalogStops}
		/>
	);
}

/** Writes the camera after pan/zoom so the next tool screen can restore it. */
function ViewMemory() {
	const map = useMapInstance();
	const { setCamera } = useAreaEditor();

	useEffect(() => {
		if (!map) return;
		const save = () => {
			const { lng, lat } = map.getCenter();
			setCamera({
				center: [lng, lat],
				zoom: map.getZoom(),
				bearing: map.getBearing(),
				pitch: map.getPitch(),
			});
		};
		save();
		map.on("moveend", save);
		return () => {
			map.off("moveend", save);
		};
	}, [map, setCamera]);

	return null;
}
