import type { BBox, LngLat } from "@zero-lag/geo";
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
	const targetRef = useRef(target);
	targetRef.current = target;
	const key =
		target === null
			? ""
			: target.kind === "point"
				? `p:${target.point.join(",")}`
				: `b:${target.bounds.join(",")}`;
	useEffect(() => {
		const next = targetRef.current;
		if (!map || !next) return;
		if (next.kind === "point") {
			map.flyTo({
				center: [...next.point],
				zoom: Math.max(map.getZoom(), 15),
			});
		} else {
			map.fitBounds(
				[
					[next.bounds[0], next.bounds[1]],
					[next.bounds[2], next.bounds[3]],
				],
				{ padding: 48 },
			);
		}
	}, [map, key]);
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

export function MapFitSelection({ bounds }: { readonly bounds: BBox | null }) {
	const map = useMapInstance();

	return (
		<button
			aria-label="Show the whole area"
			className="grid size-11 place-items-center rounded-[14px] border border-hairline bg-surface/90 text-ink shadow-sm backdrop-blur"
			data-testid="area-fit-selection"
			disabled={!bounds || !map}
			onClick={() => {
				if (!map || !bounds) return;
				map.fitBounds(
					[
						[bounds[0], bounds[1]],
						[bounds[2], bounds[3]],
					],
					{ padding: 48, duration: 500 },
				);
			}}
			type="button"
		>
			<svg
				aria-hidden="true"
				fill="none"
				height="20"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				viewBox="0 0 24 24"
				width="20"
			>
				<title>Fit</title>
				<path d="M8 3H5a2 2 0 0 0-2 2v3" />
				<path d="M16 3h3a2 2 0 0 1 2 2v3" />
				<path d="M8 21H5a2 2 0 0 1-2-2v-3" />
				<path d="M16 21h3a2 2 0 0 0 2-2v-3" />
			</svg>
		</button>
	);
}

export function MapIdleBounds({
	onIdle,
}: {
	readonly onIdle: (view: { bbox: BBox; zoom: number }) => void;
}) {
	const map = useMapInstance();
	const report = useRef(onIdle);
	report.current = onIdle;

	useEffect(() => {
		if (!map) return;
		const emit = () => {
			const bounds = map.getBounds();
			report.current({
				bbox: [
					bounds.getWest(),
					bounds.getSouth(),
					bounds.getEast(),
					bounds.getNorth(),
				],
				zoom: map.getZoom(),
			});
		};
		map.on("idle", emit);
		return () => {
			map.off("idle", emit);
		};
	}, [map]);
	return null;
}
