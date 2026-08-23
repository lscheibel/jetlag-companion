import type { BBox } from "@zero-lag/geo";
import { useEffect, useRef } from "react";
import { useMapInstance } from "./map-canvas";

/**
 * Reports the viewport when the map settles. m4-spec §9.
 *
 * A component rather than a hook because `useMapInstance` only resolves inside
 * `MapCanvas`, which is the same reason `MapTapHandler` is one — and it follows
 * that component's shape exactly, down to the ref that keeps the callback fresh
 * without re-subscribing.
 *
 * `idle` rather than `move` is the debounce: the builder's catalog read is a
 * network call, and firing it per frame would be a request per pixel of pan.
 */
export function MapViewportReporter({
	onSettle,
}: {
	readonly onSettle: (bounds: BBox) => void;
}) {
	const map = useMapInstance();
	const handler = useRef(onSettle);
	handler.current = onSettle;

	useEffect(() => {
		if (!map) return;
		const report = () => {
			const view = map.getBounds();
			handler.current([
				view.getWest(),
				view.getSouth(),
				view.getEast(),
				view.getNorth(),
			]);
		};
		report();
		map.on("idle", report);
		return () => {
			map.off("idle", report);
		};
	}, [map]);
	return null;
}
