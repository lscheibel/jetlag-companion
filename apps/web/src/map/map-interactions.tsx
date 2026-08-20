import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { useEffect, useRef } from "react";
import { useMapInstance } from "./map-canvas";

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

export function RadiusDragHandler({
	active,
	onChange,
}: {
	readonly active: boolean;
	readonly onChange: (center: LngLat, radiusMeters: number) => void;
}) {
	const map = useMapInstance();
	const change = useRef(onChange);
	change.current = onChange;

	useEffect(() => {
		if (!map || !active) return;
		let center: LngLat | null = null;
		const start = (event: { lngLat: { lng: number; lat: number } }) => {
			center = [event.lngLat.lng, event.lngLat.lat];
			map.dragPan.disable();
		};
		const move = (event: { lngLat: { lng: number; lat: number } }) => {
			if (!center) return;
			const edge: LngLat = [event.lngLat.lng, event.lngLat.lat];
			change.current(center, Math.max(1, distanceMeters(center, edge)));
		};
		const end = () => {
			center = null;
			map.dragPan.enable();
		};
		map.on("mousedown", start);
		map.on("mousemove", move);
		map.on("mouseup", end);
		return () => {
			map.off("mousedown", start);
			map.off("mousemove", move);
			map.off("mouseup", end);
			map.dragPan.enable();
		};
	}, [map, active]);
	return null;
}
