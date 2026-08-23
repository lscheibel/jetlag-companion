import type { LngLat } from "@zero-lag/geo";
import {
	applyRadiusGesture,
	applyRingGesture,
	type RadiusDraft,
	type RingDraft,
} from "./draw-gestures";
import type { DrawHandle } from "./draw-handles";
import {
	hitHandle,
	hitRingEdge,
	radiusHandles,
	ringHandles,
} from "./draw-handles";

/** Movement below this is a tap, not a drag. */
export const TAP_SLOP_PX = 8;

export type PointerMode =
	| { readonly kind: "off" }
	| { readonly kind: "tap" }
	| {
			readonly kind: "radius";
			readonly center: LngLat | null;
			readonly radiusMeters: number;
	  }
	| {
			readonly kind: "ring";
			readonly points: readonly LngLat[];
			readonly closed: boolean;
	  };

export type GestureCause = "tap" | "move" | "end";

export type MapPointerEvent = {
	lngLat: { lng: number; lat: number };
	point: { x: number; y: number };
	points?: readonly { x: number; y: number }[];
	preventDefault?: () => void;
};

/**
 * The MapLibre surface this session needs, and nothing else — so a test can
 * stand in without constructing a GL context.
 */
export type PointerMap = {
	on(type: string, handler: (event: MapPointerEvent) => void): void;
	off(type: string, handler: (event: MapPointerEvent) => void): void;
	project(lngLat: LngLat | { lng: number; lat: number }): {
		x: number;
		y: number;
	};
	dragPan: { disable(): void; enable(): void };
};

export type PointerSession = {
	getMode: () => PointerMode;
	onTap: (
		point: LngLat,
		project: (lngLat: LngLat) => { x: number; y: number },
		screen: { x: number; y: number },
	) => void;
	onRadiusChange: (draft: RadiusDraft, cause: GestureCause) => void;
	onRingChange: (draft: RingDraft, cause: GestureCause) => void;
};

type Capture =
	| {
			kind: "handle";
			target: "radius" | "ring";
			handle: DrawHandle;
			liveRadius: RadiusDraft;
			liveRing: RingDraft;
			start: { x: number; y: number };
			moved: boolean;
			panHeld: boolean;
	  }
	| {
			kind: "create-radius";
			startPoint: LngLat;
			start: { x: number; y: number };
			live: RadiusDraft;
			moved: boolean;
			panHeld: boolean;
	  }
	| {
			kind: "maybe-tap";
			startPoint: LngLat;
			start: { x: number; y: number };
			moved: boolean;
			panHeld: boolean;
	  };

function isMultiTouch(event: MapPointerEvent): boolean {
	return (event.points?.length ?? 1) > 1;
}

function eventPoint(event: MapPointerEvent): LngLat {
	return [event.lngLat.lng, event.lngLat.lat];
}

function projectLngLat(
	map: PointerMap,
	point: LngLat,
): { x: number; y: number } {
	const screen = map.project(point);
	return { x: screen.x, y: screen.y };
}

/**
 * Mouse and touch on one pipeline. A handle (or an empty-map radius create)
 * holds pan only for that gesture; everything else leaves the map free to pan.
 */
export function bindMapPointers(
	map: PointerMap,
	session: PointerSession,
): () => void {
	let capture: Capture | null = null;

	const releasePan = (held: boolean) => {
		if (held) map.dragPan.enable();
	};

	const down = (event: MapPointerEvent) => {
		const mode = session.getMode();
		if (mode.kind === "off") return;
		if (isMultiTouch(event)) return;
		const point = eventPoint(event);
		const pixel = event.point;

		if (mode.kind === "radius") {
			const hit = hitHandle(
				radiusHandles(mode.center, mode.radiusMeters),
				pixel,
				(lngLat) => projectLngLat(map, lngLat),
			);
			if (hit) {
				event.preventDefault?.();
				map.dragPan.disable();
				capture = {
					kind: "handle",
					target: "radius",
					handle: hit,
					liveRadius: {
						center: mode.center,
						radiusMeters: mode.radiusMeters,
					},
					liveRing: { points: [] },
					start: pixel,
					moved: false,
					panHeld: true,
				};
				return;
			}
			if (!mode.center) {
				event.preventDefault?.();
				map.dragPan.disable();
				capture = {
					kind: "create-radius",
					startPoint: point,
					start: pixel,
					live: { center: null, radiusMeters: mode.radiusMeters },
					moved: false,
					panHeld: true,
				};
				return;
			}
			capture = {
				kind: "maybe-tap",
				startPoint: point,
				start: pixel,
				moved: false,
				panHeld: false,
			};
			return;
		}

		if (mode.kind === "ring") {
			const project = (lngLat: LngLat) => projectLngLat(map, lngLat);
			const hit = hitHandle(ringHandles(mode.points), pixel, project);
			if (hit) {
				event.preventDefault?.();
				map.dragPan.disable();
				capture = {
					kind: "handle",
					target: "ring",
					handle: hit,
					liveRadius: { center: null, radiusMeters: 0 },
					liveRing: { points: mode.points },
					start: pixel,
					moved: false,
					panHeld: true,
				};
				return;
			}
			const edge = hitRingEdge(mode.points, pixel, project, mode.closed);
			if (edge) {
				event.preventDefault?.();
				map.dragPan.disable();
				const liveRing = applyRingGesture(
					{ points: mode.points },
					{ kind: "insert", index: edge.insertIndex, point: edge.point },
				);
				session.onRingChange(liveRing, "tap");
				capture = {
					kind: "handle",
					target: "ring",
					handle: { kind: "vertex", index: edge.insertIndex },
					liveRadius: { center: null, radiusMeters: 0 },
					liveRing,
					start: pixel,
					moved: false,
					panHeld: true,
				};
				return;
			}
			capture = {
				kind: "maybe-tap",
				startPoint: point,
				start: pixel,
				moved: false,
				panHeld: false,
			};
			return;
		}

		capture = {
			kind: "maybe-tap",
			startPoint: point,
			start: pixel,
			moved: false,
			panHeld: false,
		};
	};

	const move = (event: MapPointerEvent) => {
		if (!capture) return;
		if (isMultiTouch(event)) {
			releasePan(capture.panHeld);
			capture = null;
			return;
		}
		const dist = Math.hypot(
			event.point.x - capture.start.x,
			event.point.y - capture.start.y,
		);
		if (dist > TAP_SLOP_PX) capture.moved = true;
		const point = eventPoint(event);

		if (capture.kind === "handle") {
			if (capture.target === "radius") {
				capture.liveRadius = applyRadiusGesture(capture.liveRadius, {
					kind: "move",
					handle: capture.handle,
					point,
				});
				session.onRadiusChange(capture.liveRadius, "move");
			} else {
				capture.liveRing = applyRingGesture(capture.liveRing, {
					kind: "move",
					handle: capture.handle,
					point,
				});
				session.onRingChange(capture.liveRing, "move");
			}
			return;
		}

		if (capture.kind === "create-radius" && capture.moved) {
			if (!capture.live.center) {
				capture.live = applyRadiusGesture(capture.live, {
					kind: "tap",
					point: capture.startPoint,
				});
			}
			capture.live = applyRadiusGesture(capture.live, {
				kind: "move",
				handle: { kind: "radius-edge" },
				point,
			});
			session.onRadiusChange(capture.live, "move");
			return;
		}

		if (capture.kind === "maybe-tap" && capture.moved) {
			capture = null;
		}
	};

	const finish = (commitTap: boolean) => {
		if (!capture) return;
		const was = capture;
		capture = null;
		releasePan(was.panHeld);
		if (!commitTap) return;

		if (!was.moved) {
			const mode = session.getMode();
			if (was.kind === "create-radius") {
				session.onRadiusChange(
					applyRadiusGesture(was.live, { kind: "tap", point: was.startPoint }),
					"tap",
				);
				return;
			}
			if (was.kind === "maybe-tap" && mode.kind === "radius") {
				session.onRadiusChange(
					applyRadiusGesture(
						{
							center: mode.center,
							radiusMeters: mode.radiusMeters,
						},
						{ kind: "tap", point: was.startPoint },
					),
					"tap",
				);
				return;
			}
			if (was.kind === "maybe-tap" && mode.kind === "ring") {
				session.onRingChange(
					applyRingGesture(
						{ points: mode.points },
						{ kind: "tap", point: was.startPoint },
					),
					"tap",
				);
				return;
			}
			if (was.kind === "maybe-tap" && mode.kind === "tap") {
				session.onTap(
					was.startPoint,
					(lngLat) => projectLngLat(map, lngLat),
					was.start,
				);
			}
			return;
		}

		if (was.kind === "handle" && was.target === "radius") {
			session.onRadiusChange(
				applyRadiusGesture(was.liveRadius, { kind: "end" }),
				"end",
			);
			return;
		}
		if (was.kind === "handle") {
			session.onRingChange(
				applyRingGesture(was.liveRing, { kind: "end" }),
				"end",
			);
			return;
		}
		if (was.kind === "create-radius") {
			session.onRadiusChange(
				applyRadiusGesture(was.live, { kind: "end" }),
				"end",
			);
		}
	};

	const up = () => finish(true);
	const cancel = () => finish(false);

	map.on("mousedown", down);
	map.on("touchstart", down);
	map.on("mousemove", move);
	map.on("touchmove", move);
	map.on("mouseup", up);
	map.on("touchend", up);
	map.on("touchcancel", cancel);

	return () => {
		map.off("mousedown", down);
		map.off("touchstart", down);
		map.off("mousemove", move);
		map.off("touchmove", move);
		map.off("mouseup", up);
		map.off("touchend", up);
		map.off("touchcancel", cancel);
		if (capture?.panHeld) map.dragPan.enable();
		capture = null;
	};
}
