import {
	type BBox,
	type MultiPolygon,
	multiPolygonToRegion,
	regionToMultiPolygon,
	subtractRegions,
} from "@zero-lag/geo";
import { useEffect, useState } from "react";
import { useMapInstance } from "./map-canvas";

/**
 * Viewport minus the hole. The playable area stays the map; everything else
 * on screen is the dim. A globe-sized complement is a MapLibre antimeridian
 * trap, so the outer ring is the current view, not WORLD.
 */
export function outsideViewport(
	area: MultiPolygon | null,
	view: BBox | null,
): MultiPolygon | null {
	if (!area || area.length === 0 || !view) return null;
	const [west, south, east, north] = view;
	const frame = {
		polygons: [
			[
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south],
				],
			],
		],
	};
	const outside = subtractRegions(frame, multiPolygonToRegion(area));
	return outside.polygons.length === 0 ? null : regionToMultiPolygon(outside);
}

/** Current map bounds, padded so the dim still covers a pan that is in flight. */
export function usePaddedView(): BBox | null {
	const map = useMapInstance();
	const [view, setView] = useState<BBox | null>(null);

	useEffect(() => {
		if (!map) return;
		let frame = 0;
		const emit = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				const bounds = map.getBounds();
				const west = bounds.getWest();
				const south = bounds.getSouth();
				const east = bounds.getEast();
				const north = bounds.getNorth();
				const padLng = (east - west) * 0.08;
				const padLat = (north - south) * 0.08;
				setView([west - padLng, south - padLat, east + padLng, north + padLat]);
			});
		};
		emit();
		map.on("move", emit);
		map.on("resize", emit);
		return () => {
			cancelAnimationFrame(frame);
			map.off("move", emit);
			map.off("resize", emit);
		};
	}, [map]);

	return view;
}
