import type { PositionSnapshot } from "@zero-lag/schema";
import { useEffect, useRef } from "react";

import type { Camera } from "./camera";
import { useMapInstance } from "./map-canvas";

interface CameraControllerProps {
	readonly camera: Camera;
	readonly fix: PositionSnapshot | null;
	readonly headingDeg: number | null;
	readonly onUserGesture: () => void;
}

/**
 * The camera, applied. m2-spec §12.
 *
 * Any user gesture drops to `free`. Dragging the map is an unambiguous
 * statement about what you want to look at, and a view that snaps back a second
 * later is the single most infuriating thing a map can do.
 */
export function CameraController({
	camera,
	fix,
	headingDeg,
	onUserGesture,
}: CameraControllerProps) {
	const map = useMapInstance();
	const notify = useRef(onUserGesture);
	notify.current = onUserGesture;
	const following = useRef(camera.mode !== "free");
	following.current = camera.mode !== "free";

	useEffect(() => {
		if (!map) return;
		const release = () => {
			if (following.current) notify.current();
		};
		// `dragstart` and `zoomstart` fire for programmatic moves too, so the
		// originating event is what separates a thumb from `easeTo`.
		const onDrag = (event: { originalEvent?: unknown }) => {
			if (event.originalEvent) release();
		};
		map.on("dragstart", onDrag);
		map.on("zoomstart", onDrag);
		map.on("rotatestart", onDrag);
		map.on("pitchstart", onDrag);
		return () => {
			map.off("dragstart", onDrag);
			map.off("zoomstart", onDrag);
			map.off("rotatestart", onDrag);
			map.off("pitchstart", onDrag);
		};
	}, [map]);

	useEffect(() => {
		if (!map || camera.mode === "free") return;
		if (!fix || fix.source === "unavailable") return;

		map.easeTo({
			center: [fix.lng, fix.lat],
			bearing:
				camera.mode === "followHeading" && headingDeg !== null ? headingDeg : 0,
			duration: 300,
		});
	}, [map, camera.mode, fix, headingDeg]);

	return null;
}
