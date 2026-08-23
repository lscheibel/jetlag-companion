import type { LngLat } from "@zero-lag/geo";
import { useEffect, useRef } from "react";
import type { RadiusDraft, RingDraft } from "./draw-gestures";
import { useMapInstance } from "./map-canvas";
import {
	bindMapPointers,
	type GestureCause,
	type PointerMap,
	type PointerMode,
} from "./map-pointer";

export type { PointerMode } from "./map-pointer";

export function MapTapHandler({
	onTap,
}: {
	readonly onTap: (point: LngLat) => void;
}) {
	const map = useMapInstance();
	const handler = useRef(onTap);
	handler.current = onTap;

	useEffect(() => {
		if (!map) return;
		const tap = (event: { lngLat: { lng: number; lat: number } }) =>
			handler.current([event.lngLat.lng, event.lngLat.lat]);
		map.on("click", tap);
		return () => {
			map.off("click", tap);
		};
	}, [map]);
	return null;
}

export function MapFlyTo({
	target,
}: {
	readonly target:
		| { readonly kind: "point"; readonly point: LngLat }
		| {
				readonly kind: "bounds";
				readonly bounds: readonly [number, number, number, number];
		  }
		| null;
}) {
	const map = useMapInstance();
	useEffect(() => {
		if (!map || !target) return;
		if (target.kind === "point") {
			map.flyTo({
				center: [...target.point],
				zoom: Math.max(map.getZoom(), 15),
			});
		} else {
			map.fitBounds(
				[
					[target.bounds[0], target.bounds[1]],
					[target.bounds[2], target.bounds[3]],
				],
				{ padding: 48 },
			);
		}
	}, [map, target]);
	return null;
}

/**
 * Mouse and touch on one pipeline. Mode is read from a ref so a gesture that
 * started on an empty map can keep going after React commits the first vertex.
 */
export function MapPointerHandler({
	mode,
	onTap,
	onRadiusChange,
	onRingChange,
}: {
	readonly mode: PointerMode;
	readonly onTap?: (
		point: LngLat,
		project: (lngLat: LngLat) => { x: number; y: number },
		screen: { x: number; y: number },
	) => void;
	readonly onRadiusChange?: (draft: RadiusDraft, cause: GestureCause) => void;
	readonly onRingChange?: (draft: RingDraft, cause: GestureCause) => void;
}) {
	const map = useMapInstance();
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const tapRef = useRef(onTap);
	tapRef.current = onTap;
	const radiusRef = useRef(onRadiusChange);
	radiusRef.current = onRadiusChange;
	const ringRef = useRef(onRingChange);
	ringRef.current = onRingChange;

	useEffect(() => {
		if (!map) return;
		return bindMapPointers(map as unknown as PointerMap, {
			getMode: () => modeRef.current,
			onTap: (point, project, screen) =>
				tapRef.current?.(point, project, screen),
			onRadiusChange: (draft, cause) => radiusRef.current?.(draft, cause),
			onRingChange: (draft, cause) => ringRef.current?.(draft, cause),
		});
	}, [map]);
	return null;
}
