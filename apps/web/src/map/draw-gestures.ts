import { distanceMeters, type LngLat } from "@zero-lag/geo";
import type { DrawHandle } from "./draw-handles";

export type RadiusDraft = {
	readonly center: LngLat | null;
	readonly radiusMeters: number;
};

export type RingDraft = {
	readonly points: readonly LngLat[];
};

export type DrawGesture =
	| { readonly kind: "tap"; readonly point: LngLat }
	| {
			readonly kind: "insert";
			readonly index: number;
			readonly point: LngLat;
	  }
	| {
			readonly kind: "move";
			readonly handle: DrawHandle;
			readonly point: LngLat;
	  }
	| { readonly kind: "end" };

export function applyRadiusGesture(
	draft: RadiusDraft,
	gesture: DrawGesture,
): RadiusDraft {
	if (gesture.kind === "end") return draft;
	if (gesture.kind === "tap") {
		if (draft.center) return draft;
		return { ...draft, center: gesture.point };
	}
	if (gesture.kind === "insert") return draft;
	if (gesture.handle.kind === "radius-center") {
		if (!draft.center) return draft;
		return { ...draft, center: gesture.point };
	}
	if (gesture.handle.kind === "radius-edge") {
		if (!draft.center) return draft;
		return {
			...draft,
			radiusMeters: Math.max(1, distanceMeters(draft.center, gesture.point)),
		};
	}
	return draft;
}

export function applyRingGesture(
	draft: RingDraft,
	gesture: DrawGesture,
): RingDraft {
	if (gesture.kind === "end") return draft;
	if (gesture.kind === "tap") {
		return { points: [...draft.points, gesture.point] };
	}
	if (gesture.kind === "insert") {
		const index = Math.max(0, Math.min(gesture.index, draft.points.length));
		return {
			points: [
				...draft.points.slice(0, index),
				gesture.point,
				...draft.points.slice(index),
			],
		};
	}
	if (gesture.handle.kind !== "vertex") return draft;
	const index = gesture.handle.index;
	if (index < 0 || index >= draft.points.length) {
		return draft;
	}
	return {
		points: draft.points.map((point, pointIndex) =>
			pointIndex === index ? gesture.point : point,
		),
	};
}
