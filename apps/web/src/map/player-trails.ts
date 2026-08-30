import { type LngLat, metersPerDegree } from "@zero-lag/geo";
import type { ClientFix } from "@zero-lag/schema";
import type { FeatureData } from "./geojson";
import { EMPTY_FEATURES } from "./geojson";

/**
 * Where a player has been, from the durable log. m2-spec §4 as amended.
 *
 * Markers come from presence, which is lossy on purpose and knows only the
 * latest fix. The trail behind a marker is the one thing presence cannot
 * supply, so it comes from `queries.positionLog()` — filtered on the server to
 * the same rows the channel would have sent live, never in here. This file has
 * no idea whose rows it was handed and does not check.
 */

/** One row of `positionSnapshot`, narrowed to what a line needs. */
export interface TrailSnapshot {
	readonly playerId: string;
	readonly roundId: string | null;
	readonly capturedAt: number;
	readonly fix: ClientFix;
}

/**
 * A player who may be drawn, with the head of their track. `head` is the live
 * presence fix — or this device's own watch, for yourself — and `null` for a
 * player with no current position at all.
 */
export interface TrailPlayer {
	readonly playerId: string;
	readonly color: string;
	readonly head: ClientFix | null;
	/**
	 * How old `head` is, in milliseconds — the staleness number m2-spec §5
	 * already computes, not a subtraction anybody does here.
	 *
	 * This is the whole reason the fade is possible at all. A trail's age is
	 * `now - capturedAt`, and `capturedAt` is the *sender's* clock: doing that
	 * subtraction on the reader's clock is the one operation m0-spec §7 says is
	 * never performed. Dating the head from a server-measured age and then
	 * walking backwards through one phone's own timestamps never compares two
	 * clocks at any point. `null` where the age is unknown, which is a player
	 * who has no marker either.
	 */
	readonly headAgeMs: number | null;
}

/**
 * A point on a trail and how long ago it was reported.
 *
 * Age rather than a timestamp, deliberately: by the time anything downstream
 * sees a vertex the clock question has been settled, and there is no timestamp
 * left lying around for someone to subtract `Date.now()` from.
 */
export interface TrailVertex {
	readonly point: LngLat;
	readonly ageMs: number;
}

export interface PlayerTrail {
	readonly playerId: string;
	readonly color: string;
	readonly points: readonly TrailVertex[];
}

export interface BuildPlayerTrailsInput {
	readonly rows: readonly TrailSnapshot[];
	readonly players: readonly TrailPlayer[];
	/** The running round. No round, no trails: a trail is a round's track. */
	readonly roundId: string | null;
	/** How far back a trail reaches. Older points are dropped. */
	readonly windowMs: number;
}

/** A fix with no position in it is not a place anybody was. */
function pointOf(fix: ClientFix): LngLat | null {
	return fix.source === "unavailable" ? null : [fix.lng, fix.lat];
}

/**
 * One LineString's worth of points per player, oldest first, each dated.
 *
 * The rows are grouped by player and sorted by `capturedAt` here rather than
 * trusted from the query, because a queue that surfaced after ten minutes
 * underground arrives late and belongs where it was captured (m0-spec §8).
 *
 * The live fix is appended as the last vertex so the line reaches the marker
 * instead of stopping a whole sampling interval behind it. It is also what
 * dates the rest: every point is aged as "the head's age, plus how long before
 * the head it was captured", and that second term is a difference between two
 * timestamps from one phone's own clock. No reader's clock ever meets a
 * sender's. m0-spec §7, m2-spec §5.
 *
 * A player whose head cannot be dated gets no trail — that is a player with no
 * marker either, and an undated track cannot honour a window or a fade.
 *
 * These are the measured points and only those — `smoothPath` is what decides
 * how the curve gets from one to the next, and it is kept separate so that
 * "where somebody was" and "how it is drawn" stay two different questions.
 */
export function buildPlayerTrails({
	rows,
	players,
	roundId,
	windowMs,
}: BuildPlayerTrailsInput): PlayerTrail[] {
	if (roundId === null) return [];

	const byPlayer = new Map<string, TrailSnapshot[]>();
	for (const row of rows) {
		if (row.roundId !== roundId) continue;
		if (row.fix.source === "unavailable") continue;
		const group = byPlayer.get(row.playerId);
		if (group) group.push(row);
		else byPlayer.set(row.playerId, [row]);
	}

	const trails: PlayerTrail[] = [];
	for (const player of players) {
		const { head, headAgeMs } = player;
		if (!head || headAgeMs === null) continue;

		const logged = [...(byPlayer.get(player.playerId) ?? [])].sort(
			(a, b) => a.capturedAt - b.capturedAt,
		);

		const points: TrailVertex[] = [];
		for (const row of logged) {
			const point = pointOf(row.fix);
			if (!point) continue;
			const ageMs = headAgeMs + (head.capturedAt - row.capturedAt);
			// Fades to nothing at the edge, so the cut itself is never a visible
			// end. A row newer than the head is a rounding artefact, not history.
			if (ageMs > windowMs || ageMs < 0) continue;
			points.push({ point, ageMs });
		}

		/**
		 * A head that is not newer than the last logged fix *is* that fix, already
		 * drawn — and both timestamps are the same phone's, so the comparison is
		 * legal. m0-spec §7.
		 */
		const last = logged.at(-1);
		if (!last || head.capturedAt > last.capturedAt) {
			const point = pointOf(head);
			if (point && headAgeMs <= windowMs) {
				points.push({ point, ageMs: headAgeMs });
			}
		}

		// A single point is a marker, and there is already one there.
		if (points.length < 2) continue;
		trails.push({ playerId: player.playerId, color: player.color, points });
	}
	return trails;
}

/**
 * Vertices drawn between each pair of measured points. Eight is the point at
 * which the corners stop being visible at street zoom; more is a longer
 * coordinate array for a curve nobody can see any better.
 */
const SEGMENT_STEPS = 8;

/**
 * The exponent that makes this *centripetal* Catmull-Rom rather than uniform.
 *
 * A uniform spline through GPS points loops and cusps wherever two fixes are
 * close together and the next is far away — which is exactly what standing at a
 * platform and then boarding a train looks like. At 0.5 the curve cannot self-
 * intersect between two points, so a phone that sat still does not produce a
 * flourish.
 */
const CENTRIPETAL = 0.5;

function knot(a: readonly [number, number], b: readonly [number, number]) {
	return (Math.hypot(b[0] - a[0], b[1] - a[1]) || 0) ** CENTRIPETAL;
}

/**
 * A curve through the measured points rather than a chain of straight segments.
 *
 * The points themselves are untouched: the spline is interpolating, so it
 * passes through every fix, and the smoothing only changes what is drawn
 * *between* two of them. That is a claim — the route between two fixes was
 * never observed — and it is made deliberately: a walk sampled every five
 * seconds is a series of shallow turns, and drawing it as mitre joints reads as
 * a series of decisions the player did not make.
 *
 * Computed in a locally metric frame rather than in raw degrees. A degree of
 * longitude is about 61% of a degree of latitude in Berlin, and a spline fitted
 * in degrees is stretched by that ratio — the curve leans east–west in a way
 * that has nothing to do with where anybody walked. m0-spec §9 keeps one door
 * for metres and degrees, and this goes through it.
 */
export function smoothPath(points: readonly TrailVertex[]): TrailVertex[] {
	if (points.length < 3) return points.map((vertex) => ({ ...vertex }));

	const meanLat =
		points.reduce((total, { point }) => total + point[1], 0) / points.length;
	const scale = metersPerDegree(meanLat);
	const flat = points.map(
		({ point }) =>
			[point[0] * scale.lng, point[1] * scale.lat] as [number, number],
	);
	// Age rides along the same parameter as position: a vertex drawn a third of
	// the way between two fixes is a third of the way between their ages.
	const ages = points.map((vertex) => vertex.ageMs);

	/**
	 * The first and last segments have no neighbour to take a tangent from, so
	 * each end is reflected through its own endpoint. Clamping to the endpoint
	 * instead flattens the curve where the trail is freshest — which is the end
	 * with the marker on it.
	 */
	const first = flat[0] as [number, number];
	const second = flat[1] as [number, number];
	const last = flat[flat.length - 1] as [number, number];
	const penultimate = flat[flat.length - 2] as [number, number];
	const control: [number, number][] = [
		[2 * first[0] - second[0], 2 * first[1] - second[1]],
		...flat,
		[2 * last[0] - penultimate[0], 2 * last[1] - penultimate[1]],
	];

	const out: TrailVertex[] = [];
	const push = (x: number, y: number, ageMs: number) => {
		out.push({ point: [x / scale.lng, y / scale.lat], ageMs });
	};
	push(first[0], first[1], ages[0] as number);

	for (let i = 0; i + 3 < control.length; i++) {
		const ageFrom = ages[i] as number;
		const ageTo = ages[i + 1] as number;
		const p0 = control[i] as [number, number];
		const p1 = control[i + 1] as [number, number];
		const p2 = control[i + 2] as [number, number];
		const p3 = control[i + 3] as [number, number];

		const t0 = 0;
		const t1 = t0 + knot(p0, p1);
		const t2 = t1 + knot(p1, p2);
		const t3 = t2 + knot(p2, p3);

		// Two fixes at the same place leave a zero-length knot interval and no
		// curve to speak of; the straight segment is the honest answer there.
		if (t1 === t0 || t2 === t1 || t3 === t2) {
			push(p2[0], p2[1], ageTo);
			continue;
		}

		for (let step = 1; step <= SEGMENT_STEPS; step++) {
			const u = step / SEGMENT_STEPS;
			const t = t1 + (t2 - t1) * u;
			const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
			const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
			const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
			const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
			const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
			const c = lerp(b1, b2, (t - t1) / (t2 - t1));
			push(c[0], c[1], ageFrom + (ageTo - ageFrom) * u);
		}
	}

	return out;
}

function lerp(
	a: readonly [number, number],
	b: readonly [number, number],
	t: number,
): [number, number] {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * How many opacity steps the fade is cut into.
 *
 * MapLibre can only paint one opacity per feature, so a continuous fade would
 * mean one feature per drawn segment — thousands of them, rebuilt on every
 * tick. Sixteen bands is one feature per band per player, and a 6% step between
 * neighbours is below what the eye picks out of a hairline.
 */
const FADE_BANDS = 16;

/** 1 at the head, 0 at the window's edge, quantized to a band. */
function fadeOf(ageMs: number, windowMs: number): number {
	const remaining = Math.min(1, Math.max(0, 1 - ageMs / windowMs));
	const band = Math.min(FADE_BANDS - 1, Math.floor(remaining * FADE_BANDS));
	return (band + 1) / FADE_BANDS;
}

interface TrailFeature {
	readonly type: "Feature";
	readonly properties: {
		readonly playerId: string;
		readonly color: string;
		readonly fade: number;
	};
	readonly geometry: {
		readonly type: "LineString";
		readonly coordinates: number[][];
	};
}

/**
 * The paint reads `color` and `fade` off each feature, so one source and one
 * layer draw every team at every age — rather than a layer per team appearing
 * and disappearing with the roster.
 *
 * One trail becomes a run of features, split wherever the fade steps down.
 * Consecutive runs share the vertex between them, so the trail is continuous
 * even though it is drawn in pieces.
 */
export function trailsFeature(
	trails: readonly PlayerTrail[],
	windowMs: number,
): FeatureData {
	const features: TrailFeature[] = [];

	for (const trail of trails) {
		const curve = smoothPath(trail.points);
		if (curve.length < 2) continue;

		const cut = (from: number, to: number, fade: number) => {
			features.push({
				type: "Feature",
				properties: { playerId: trail.playerId, color: trail.color, fade },
				geometry: {
					type: "LineString",
					coordinates: curve
						.slice(from, to + 1)
						.map(({ point }) => [point[0], point[1]]),
				},
			});
		};

		let start = 0;
		// A segment is as faded as its newer end: the trail should reach full
		// strength where it meets the marker, not one band short of it.
		let fade = fadeOf((curve[1] as TrailVertex).ageMs, windowMs);
		for (let i = 2; i < curve.length; i++) {
			const next = fadeOf((curve[i] as TrailVertex).ageMs, windowMs);
			if (next === fade) continue;
			cut(start, i - 1, fade);
			start = i - 1;
			fade = next;
		}
		cut(start, curve.length - 1, fade);
	}

	if (features.length === 0) return EMPTY_FEATURES;
	return { type: "FeatureCollection", features };
}
