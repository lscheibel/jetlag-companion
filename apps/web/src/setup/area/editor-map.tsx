import type { BBox, LngLat } from "@zero-lag/geo";
import { cn } from "@zero-lag/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { MapCanvas, type MapStatus } from "../../map/map-canvas";
import { BERLIN_CENTER } from "./labels";

interface EditorMapProps {
	readonly bounds: BBox | null;
	readonly center?: LngLat;
	readonly fitPadding?: number;
	readonly className?: string;
	readonly children: ReactNode;
}

export function EditorMap({
	bounds,
	center = BERLIN_CENTER,
	fitPadding,
	className,
	children,
}: EditorMapProps) {
	const [status, setStatus] = useState<MapStatus>("loading");

	return (
		<div
			className={cn("relative min-h-0 overflow-hidden bg-map-land", className)}
		>
			<MapCanvas
				fitPadding={fitPadding}
				initialBounds={bounds}
				initialCenter={center}
				onStatusChange={setStatus}
			>
				{children}
			</MapCanvas>
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
