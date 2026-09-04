import type { ClientFix } from "@zero-lag/schema";
import { describe, expect, it } from "vitest";
import {
	buildPlayerTrails,
	type PlayerTrail,
	smoothPath,
	type TrailPlayer,
	type TrailSnapshot,
	type TrailVertex,
	trailsFeature,
} from "./player-trails";

const ROUND = "round-1";
const WINDOW = 15 * 60_000;
/** A minute of silence, which is twelve missed samples at the default cadence. */
const GAP = 60_000;

function fix(lng: number, lat: number, capturedAt: number): ClientFix {
	return {
		lng,
		lat,
		accuracyMeters: 12,
		headingDeg: null,
		speedMps: null,
		capturedAt,
		source: "gps",
	};
}

function unavailable(capturedAt: number): ClientFix {
	return { ...fix(0, 0, capturedAt), source: "unavailable" };
}

function row(
	playerId: string,
	captured: ClientFix,
	roundId: string | null = ROUND,
): TrailSnapshot {
	return {
		playerId,
		roundId,
		capturedAt: captured.capturedAt,
		fix: captured,
	};
}

/**
 * A player whose live fix is `head`, that fix being `headAgeMs` old.
 *
 * Every trail needs a dated head, because that is the only thing standing
 * between the fade and a subtraction across two device clocks. m0-spec §7.
 */
function player(
	playerId: string,
	head: ClientFix | null,
	headAgeMs: number | null = head ? 0 : null,
	color = "#0072B2",
): TrailPlayer {
	return { playerId, color, head, headAgeMs };
}

/** The ordinary state between two samples: the head is the last logged fix. */
function resting(
	playerId: string,
	logged: readonly ClientFix[],
	headAgeMs = 0,
): TrailPlayer {
	return player(playerId, logged.at(-1) ?? null, headAgeMs);
}

function places(trail: PlayerTrail | undefined) {
	return trail?.points.map((vertex) => vertex.point);
}

describe("buildPlayerTrails", () => {
	it("gives each player their own line, oldest point first", () => {
		const ana = [fix(13.4, 52.5, 2_000), fix(13.41, 52.51, 3_000)];
		const ben = [fix(13.3, 52.4, 1_000), fix(13.31, 52.41, 2_000)];
		const trails = buildPlayerTrails({
			rows: [
				row("ana", ana[0] as ClientFix),
				row("ben", ben[0] as ClientFix),
				row("ana", ana[1] as ClientFix),
				row("ben", ben[1] as ClientFix),
			],
			players: [resting("ana", ana), resting("ben", ben)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(trails).toHaveLength(2);
		expect(trails[0]?.playerId).toBe("ana");
		expect(trails[0]?.color).toBe("#0072B2");
		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
		]);
		expect(places(trails[1])).toEqual([
			[13.3, 52.4],
			[13.31, 52.41],
		]);
	});

	/**
	 * A queue that surfaced after ten minutes underground arrives late and
	 * belongs where it was captured. m0-spec §8.
	 */
	it("orders by capture rather than by arrival", () => {
		const walk = [
			fix(13.4, 52.5, 1_000),
			fix(13.41, 52.51, 2_000),
			fix(13.42, 52.52, 3_000),
		];
		const trails = buildPlayerTrails({
			rows: [
				row("ana", walk[2] as ClientFix),
				row("ana", walk[0] as ClientFix),
				row("ana", walk[1] as ClientFix),
			],
			players: [resting("ana", walk)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
			[13.42, 52.52],
		]);
	});

	it("draws this round only", () => {
		const thisRound = [fix(13.5, 52.6, 3_000), fix(13.51, 52.61, 4_000)];
		const trails = buildPlayerTrails({
			rows: [
				row("ana", fix(13.4, 52.5, 1_000), "round-0"),
				row("ana", fix(13.41, 52.51, 2_000), "round-0"),
				row("ana", thisRound[0] as ClientFix),
				row("ana", thisRound[1] as ClientFix),
			],
			players: [resting("ana", thisRound)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.5, 52.6],
			[13.51, 52.61],
		]);
	});

	it("draws nothing between rounds", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		expect(
			buildPlayerTrails({
				rows: walk.map((captured) => row("ana", captured)),
				players: [resting("ana", walk)],
				roundId: null,
				windowMs: WINDOW,
			}),
		).toEqual([]);
	});

	/** A fix with no position in it is not a place anybody was. m0-spec §5. */
	it("skips fixes that recorded no position", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 3_000)];
		const trails = buildPlayerTrails({
			rows: [
				row("ana", walk[0] as ClientFix),
				row("ana", unavailable(2_000)),
				row("ana", walk[1] as ClientFix),
			],
			players: [resting("ana", walk)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
		]);
	});

	it("does not reach for a live head that has no position either", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [player("ana", unavailable(9_000))],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
		]);
	});

	/**
	 * The line meets the marker instead of stopping a whole sampling interval
	 * behind it. m2-spec §4 as amended.
	 */
	it("appends the live fix as the last vertex", () => {
		const trails = buildPlayerTrails({
			rows: [row("ana", fix(13.4, 52.5, 1_000))],
			players: [player("ana", fix(13.45, 52.55, 9_000))],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.45, 52.55],
		]);
	});

	it("does not repeat a live fix that is already the last logged one", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [resting("ana", walk)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
		]);
	});

	/**
	 * Blindness and the query are both upstream of this: a player who is not in
	 * the list has no trail, however many of their rows are in the store.
	 * m2-spec §9.
	 */
	it("draws only the players it was handed", () => {
		const ana = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		const ben = [fix(13.3, 52.4, 1_000), fix(13.31, 52.41, 2_000)];
		const rows = [
			...ana.map((captured) => row("ana", captured)),
			...ben.map((captured) => row("ben", captured)),
		];

		expect(
			buildPlayerTrails({
				rows,
				players: [resting("ana", ana)],
				roundId: ROUND,
				windowMs: WINDOW,
			}).map((trail) => trail.playerId),
		).toEqual(["ana"]);
	});

	it("leaves a single point to the marker that is already there", () => {
		const walk = [fix(13.4, 52.5, 1_000)];
		expect(
			buildPlayerTrails({
				rows: walk.map((captured) => row("ana", captured)),
				players: [resting("ana", walk)],
				roundId: ROUND,
				windowMs: WINDOW,
			}),
		).toEqual([]);
	});

	it("draws a player who has only just started moving from the live head", () => {
		expect(
			buildPlayerTrails({
				rows: [],
				players: [player("ana", fix(13.4, 52.5, 1_000))],
				roundId: ROUND,
				windowMs: WINDOW,
			}),
		).toEqual([]);
	});

	/**
	 * The clock rule, asserted. Ages are the head's age plus how long before the
	 * head each fix was captured — two timestamps from one phone. m0-spec §7.
	 */
	it("ages every point back from the head rather than from a local clock", () => {
		const walk = [
			fix(13.4, 52.5, 100_000),
			fix(13.41, 52.51, 105_000),
			fix(13.42, 52.52, 110_000),
		];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [resting("ana", walk, 60_000)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(trails[0]?.points.map((vertex) => vertex.ageMs)).toEqual([
			70_000, 65_000, 60_000,
		]);
	});

	/**
	 * The leg the player is on runs across the window's edge, and the edge is a
	 * moment rather than a fix: half of a two-minute leg is inside a 90 s window
	 * and the drawing has to start halfway along it.
	 */
	it("keeps the fix beyond the window to interpolate the edge from", () => {
		const walk = [
			fix(13.4, 52.5, 0),
			fix(13.41, 52.51, 60_000),
			fix(13.42, 52.52, 120_000),
		];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [resting("ana", walk)],
			roundId: ROUND,
			// The oldest fix is two minutes before the head; the window holds 90 s.
			windowMs: 90_000,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
			[13.42, 52.52],
		]);
		expect(trails[0]?.points.map((vertex) => vertex.ageMs)).toEqual([
			120_000, 60_000, 0,
		]);
	});

	/** One anchor, not the whole afternoon behind it. */
	it("keeps only the one fix beyond the window", () => {
		const walk = [
			fix(13.37, 52.47, 0),
			fix(13.38, 52.48, 30_000),
			fix(13.4, 52.5, 60_000),
			fix(13.41, 52.51, 120_000),
			fix(13.42, 52.52, 180_000),
		];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [resting("ana", walk)],
			roundId: ROUND,
			windowMs: 90_000,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
			[13.42, 52.52],
		]);
	});

	/**
	 * The reason the anchor is kept: a phone that surfaced after half an hour
	 * underground has one fix behind the window and one in front of it, and
	 * dropping the older one leaves a marker with no history to interpolate.
	 */
	it("draws a trail across a silence longer than the window", () => {
		const walk = [fix(13.4, 52.5, 0), fix(13.5, 52.6, 30 * 60_000)];
		const trails = buildPlayerTrails({
			rows: walk.map((captured) => row("ana", captured)),
			players: [resting("ana", walk)],
			roundId: ROUND,
			windowMs: WINDOW,
		});

		expect(places(trails[0])).toEqual([
			[13.4, 52.5],
			[13.5, 52.6],
		]);
	});

	it("drops a whole trail whose head is already past the window", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		expect(
			buildPlayerTrails({
				rows: walk.map((captured) => row("ana", captured)),
				players: [resting("ana", walk, 20 * 60_000)],
				roundId: ROUND,
				windowMs: WINDOW,
			}),
		).toEqual([]);
	});

	/** No marker either — there is nothing to date the track against. */
	it("draws no trail for a player whose head cannot be dated", () => {
		const walk = [fix(13.4, 52.5, 1_000), fix(13.41, 52.51, 2_000)];
		expect(
			buildPlayerTrails({
				rows: walk.map((captured) => row("ana", captured)),
				players: [player("ana", walk.at(-1) ?? null, null)],
				roundId: ROUND,
				windowMs: WINDOW,
			}),
		).toEqual([]);
	});
});

function vertex(lng: number, lat: number, ageMs = 0): TrailVertex {
	return { point: [lng, lat], ageMs };
}

/**
 * The curve is drawn between the measured points, and the measured points are
 * still on it. m2-spec §4, _Trails_.
 */
describe("smoothPath", () => {
	it("leaves a straight run straight", () => {
		const straight = [
			vertex(13.4, 52.5),
			vertex(13.41, 52.5),
			vertex(13.42, 52.5),
			vertex(13.43, 52.5),
		];
		for (const { point } of smoothPath(straight, GAP)) {
			expect(point[1]).toBeCloseTo(52.5, 9);
			expect(point[0]).toBeGreaterThanOrEqual(13.4 - 1e-9);
			expect(point[0]).toBeLessThanOrEqual(13.43 + 1e-9);
		}
	});

	it("passes through every fix it was given", () => {
		const measured = [
			vertex(13.4, 52.5),
			vertex(13.41, 52.505),
			vertex(13.425, 52.5),
			vertex(13.43, 52.512),
		];
		const curve = smoothPath(measured, GAP);

		for (const { point } of measured) {
			expect(
				curve.some(
					({ point: drawn }) =>
						Math.abs(drawn[0] - point[0]) < 1e-9 &&
						Math.abs(drawn[1] - point[1]) < 1e-9,
				),
			).toBe(true);
		}
	});

	it("keeps the ends where they were measured", () => {
		const measured = [
			vertex(13.4, 52.5),
			vertex(13.41, 52.505),
			vertex(13.43, 52.512),
		];
		const curve = smoothPath(measured, GAP);

		expect(curve[0]?.point).toEqual([13.4, 52.5]);
		expect(curve.at(-1)?.point[0]).toBeCloseTo(13.43, 9);
		expect(curve.at(-1)?.point[1]).toBeCloseTo(52.512, 9);
	});

	it("adds vertices between the fixes rather than replacing them", () => {
		const measured = [
			vertex(13.4, 52.5),
			vertex(13.41, 52.505),
			vertex(13.43, 52.512),
		];
		expect(smoothPath(measured, GAP).length).toBeGreaterThan(measured.length);
	});

	/** The fade needs an age for every drawn vertex, not only the measured ones. */
	it("carries age along the curve, oldest first and never out of order", () => {
		const curve = smoothPath(
			[
				vertex(13.4, 52.5, 20_000),
				vertex(13.41, 52.505, 10_000),
				vertex(13.43, 52.512, 0),
			],
			GAP,
		);

		expect(curve[0]?.ageMs).toBe(20_000);
		expect(curve.at(-1)?.ageMs).toBe(0);
		for (let i = 1; i < curve.length; i++) {
			expect(curve[i]?.ageMs).toBeLessThanOrEqual(curve[i - 1]?.ageMs ?? 0);
		}
	});

	/** Two points are a segment; there is no tangent to take from anywhere. */
	it("leaves a two-point trail alone", () => {
		const measured = [vertex(13.4, 52.5, 5_000), vertex(13.41, 52.505, 0)];
		expect(smoothPath(measured, GAP)).toEqual(
			measured.map((point) => ({ ...point, inferred: false })),
		);
	});

	/**
	 * A spline through half an hour of unobserved travel would be inventing
	 * turns at exactly the moment there is least to go on. m2-spec §4, _Trails_.
	 */
	it("crosses a silence with one straight chord and marks it", () => {
		const curve = smoothPath(
			[
				vertex(13.4, 52.5, 40 * 60_000),
				vertex(13.41, 52.505, 39 * 60_000),
				vertex(13.42, 52.51, 38 * 60_000),
				// Ten minutes underground.
				vertex(13.5, 52.56, 28 * 60_000),
				vertex(13.51, 52.565, 27 * 60_000),
				vertex(13.52, 52.57, 26 * 60_000),
			],
			GAP,
		);

		const crossings = curve.filter((point) => point.inferred);
		expect(crossings).toHaveLength(1);
		expect(crossings[0]?.point).toEqual([13.5, 52.56]);

		// Straight, so the fix on the far side follows the one on the near side
		// with nothing drawn in between.
		const resumes = curve.findIndex((point) => point.inferred);
		expect(curve[resumes - 1]?.point).toEqual([13.42, 52.51]);
	});

	it("splines the runs either side of a silence as usual", () => {
		const run = [
			vertex(13.4, 52.5, 40 * 60_000),
			vertex(13.41, 52.505, 39 * 60_000),
			vertex(13.42, 52.51, 38 * 60_000),
		];
		const across = smoothPath([...run, vertex(13.5, 52.56, 28 * 60_000)], GAP);
		expect(across.length).toBeGreaterThan(run.length + 1);
	});

	/**
	 * A phone that sat still logs the same place twice, which is a zero-length
	 * knot interval and a division by zero in the naive spline.
	 */
	it("survives a player who did not move between two fixes", () => {
		const curve = smoothPath(
			[
				vertex(13.4, 52.5),
				vertex(13.41, 52.505),
				vertex(13.41, 52.505),
				vertex(13.43, 52.512),
			],
			GAP,
		);

		for (const { point, ageMs } of curve) {
			expect(Number.isFinite(point[0])).toBe(true);
			expect(Number.isFinite(point[1])).toBe(true);
			expect(Number.isFinite(ageMs)).toBe(true);
		}
	});
});

function featuresOf(data: ReturnType<typeof trailsFeature>) {
	if (!data || typeof data !== "object" || !("features" in data)) return [];
	return data.features;
}

function ageingTrail(): PlayerTrail {
	return {
		playerId: "ana",
		color: "#E69F00",
		points: Array.from({ length: 12 }, (_, index) =>
			vertex(13.4 + index * 0.002, 52.5 + index * 0.001, (11 - index) * 60_000),
		),
	};
}

describe("trailsFeature", () => {
	it("carries the team colour and a full-strength head", () => {
		const features = featuresOf(
			trailsFeature(
				[
					{
						playerId: "ana",
						color: "#E69F00",
						points: [vertex(13.4, 52.5, 1_000), vertex(13.41, 52.51, 0)],
					},
				],
				WINDOW,
				GAP,
			),
		);

		expect(features).toHaveLength(1);
		expect(features[0]?.properties).toEqual({
			playerId: "ana",
			color: "#E69F00",
			fade: 1,
			inferred: false,
		});
		expect(
			features[0]?.geometry.type === "LineString"
				? features[0].geometry.coordinates
				: null,
		).toEqual([
			[13.4, 52.5],
			[13.41, 52.51],
		]);
	});

	/** One trail, several features, because a feature carries one opacity. */
	it("cuts a long trail into bands that fade towards the old end", () => {
		const features = featuresOf(trailsFeature([ageingTrail()], WINDOW, GAP));

		expect(features.length).toBeGreaterThan(1);

		const fades = features.map((feature) => Number(feature.properties?.fade));
		expect([...fades].sort((a, b) => a - b)).toEqual(fades);
		expect(fades.at(-1)).toBe(1);
		expect(fades[0]).toBeLessThan(1);
		for (const fade of fades) {
			expect(fade).toBeGreaterThan(0);
			expect(fade).toBeLessThanOrEqual(1);
		}
	});

	/** Drawn in pieces, read as one line: each piece starts where the last ended. */
	it("shares a vertex between neighbouring bands so the trail has no gaps", () => {
		const features = featuresOf(trailsFeature([ageingTrail()], WINDOW, GAP));

		for (let i = 1; i < features.length; i++) {
			const previous = features[i - 1]?.geometry;
			const current = features[i]?.geometry;
			if (previous?.type !== "LineString" || current?.type !== "LineString") {
				throw new Error("a trail band is not a LineString");
			}
			expect(current.coordinates[0]).toEqual(previous.coordinates.at(-1));
		}
	});

	/**
	 * The bug this fade was rebuilt for: a leg drawn at the head's strength
	 * along its whole length, because the only two vertices on it were the two
	 * fixes and neither of them was old enough to step the band down.
	 */
	it("ramps the fade along a leg between two distant fixes", () => {
		const features = featuresOf(
			trailsFeature(
				[
					{
						playerId: "ana",
						color: "#E69F00",
						// Ten minutes of travel, and only its two ends were measured.
						points: [vertex(13.4, 52.5, 10 * 60_000), vertex(13.6, 52.5, 0)],
					},
				],
				WINDOW,
				GAP,
			),
		);

		expect(features.length).toBeGreaterThan(1);
		const fades = features.map((feature) => Number(feature.properties?.fade));
		expect([...fades].sort((a, b) => a - b)).toEqual(fades);
		expect(fades[0]).toBeLessThan(1);
		expect(fades.at(-1)).toBe(1);
	});

	/**
	 * The linear-traversal assumption, asserted as a position. Sixteen minutes
	 * of window is one minute a band, so a ten-minute leg steps every tenth of
	 * its length — which is where the player was at that minute if they covered
	 * it at a steady pace.
	 */
	it("puts a fade boundary where the player would have been at that moment", () => {
		const features = featuresOf(
			trailsFeature(
				[
					{
						playerId: "ana",
						color: "#E69F00",
						points: [vertex(13.4, 52.5, 10 * 60_000), vertex(13.5, 52.5, 0)],
					},
				],
				16 * 60_000,
				GAP,
			),
		);

		const starts = features.map((feature) =>
			feature.geometry.type === "LineString"
				? Number(feature.geometry.coordinates[0]?.[0])
				: Number.NaN,
		);
		for (const [index, start] of starts.entries()) {
			expect(start).toBeCloseTo(13.4 + index * 0.01, 9);
		}
		expect(features.map((feature) => Number(feature.properties?.fade))).toEqual(
			Array.from({ length: 10 }, (_, index) => (index + 7) / 16),
		);
	});

	/**
	 * The anchor is a date and a direction, not a place that gets drawn: the
	 * line begins at the moment the window does, halfway along a leg that took
	 * twice as long as the window holds.
	 */
	it("begins at the window's edge rather than at the fix beyond it", () => {
		const features = featuresOf(
			trailsFeature(
				[
					{
						playerId: "ana",
						color: "#E69F00",
						points: [vertex(13.4, 52.5, 30 * 60_000), vertex(13.6, 52.5, 0)],
					},
				],
				WINDOW,
				GAP,
			),
		);

		const first = features[0]?.geometry;
		if (first?.type !== "LineString") throw new Error("not a LineString");
		expect(first.coordinates[0]?.[0]).toBeCloseTo(13.5, 9);
		expect(Number(features[0]?.properties?.fade)).toBe(1 / 16);
		for (const feature of features) {
			expect(feature.properties?.inferred).toBe(true);
		}
	});

	/** A dash for the leg nobody saw, and a solid line either side of it. */
	it("marks only the pieces that cross a silence", () => {
		const features = featuresOf(
			trailsFeature(
				[
					{
						playerId: "ana",
						color: "#E69F00",
						points: [
							vertex(13.4, 52.5, 8 * 60_000),
							vertex(13.41, 52.505, 8 * 60_000 - 5_000),
							vertex(13.42, 52.51, 8 * 60_000 - 10_000),
							// Five minutes underground.
							vertex(13.5, 52.56, 3 * 60_000 - 10_000),
							vertex(13.51, 52.565, 3 * 60_000 - 15_000),
							vertex(13.52, 52.57, 3 * 60_000 - 20_000),
						],
					},
				],
				WINDOW,
				GAP,
			),
		);

		const marks = features.map((feature) => feature.properties?.inferred);
		// One crossing, so the dashed pieces are one stretch with solid either
		// side of it: false…false, true…true, false…false.
		const first = marks.indexOf(true);
		const last = marks.lastIndexOf(true);
		expect(first).toBeGreaterThan(0);
		expect(last).toBeLessThan(marks.length - 1);
		expect(marks.slice(first, last + 1).every(Boolean)).toBe(true);
		expect(marks.slice(0, first).some(Boolean)).toBe(false);
		expect(marks.slice(last + 1).some(Boolean)).toBe(false);

		// And the line is still one line: the dash starts where the solid ends.
		for (let i = 1; i < features.length; i++) {
			const previous = features[i - 1]?.geometry;
			const current = features[i]?.geometry;
			if (previous?.type !== "LineString" || current?.type !== "LineString") {
				throw new Error("a trail band is not a LineString");
			}
			expect(current.coordinates[0]).toEqual(previous.coordinates.at(-1));
		}
	});

	it("is an empty collection when nobody has moved", () => {
		expect(trailsFeature([], WINDOW, GAP)).toEqual({
			type: "FeatureCollection",
			features: [],
		});
	});
});
