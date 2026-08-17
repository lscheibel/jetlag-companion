import {
	distanceMeters,
	type LngLat,
	type MultiPolygon,
	metersPerDegree,
	offsetLngLat,
	type Region,
	regionArea,
	regionContains,
	regionHash,
	subtractRegions,
	WORLD_REGION,
} from "@zero-lag/geo";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyConstraint,
	type Constraint,
	type ConstraintGeometry,
	foldConstraints,
	satisfies,
	toRegion,
} from "./constraints";

/**
 * Snapping and simplification move vertices, so a point sitting within a metre
 * or two of a boundary can legitimately land on either side. That is a property
 * of the numerical hygiene the engine is required to do, not a defect in it, so
 * generated points are kept clear of the edge.
 *
 * The margin is wider than the couple of metres the engine actually moves,
 * because the checks below measure a few of these boundaries in a local metre
 * frame rather than geodesically, and that approximation is worth a handful of
 * metres at the far end of a 5 km sector.
 */
const BOUNDARY_CLEARANCE_METERS = 20;

/** Metres east and north of an origin — good enough to measure a gap with. */
function localFrame(origin: LngLat): (p: LngLat) => [number, number] {
	const scale = metersPerDegree(origin[1]);
	return (p) => [
		(p[0] - origin[0]) * scale.lng,
		(p[1] - origin[1]) * scale.lat,
	];
}

const berlinLngLat = fc
	.tuple(
		fc.double({ min: 13.1, max: 13.6, noNaN: true }),
		fc.double({ min: 52.4, max: 52.6, noNaN: true }),
	)
	.map(([lng, lat]): LngLat => [lng, lat]);

const radiusGeometry = fc
	.tuple(berlinLngLat, fc.integer({ min: 200, max: 5000 }))
	.map(
		([center, radius]): ConstraintGeometry => ({
			kind: "radius",
			center,
			radius,
		}),
	);

const halfPlaneGeometry = fc
	.tuple(berlinLngLat, berlinLngLat, fc.constantFrom<"a" | "b">("a", "b"))
	.filter(([a, b]) => distanceMeters(a, b) > 500)
	.map(
		([a, b, nearer]): ConstraintGeometry => ({
			kind: "halfPlane",
			a,
			b,
			nearer,
		}),
	);

const sectorGeometry = fc
	.tuple(
		berlinLngLat,
		fc.integer({ min: 500, max: 5000 }),
		fc.integer({ min: 0, max: 359 }),
		fc.integer({ min: 20, max: 340 }),
	)
	.map(
		([center, radius, fromDeg, sweep]): ConstraintGeometry => ({
			kind: "sector",
			center,
			radius,
			fromDeg,
			toDeg: fromDeg + sweep,
		}),
	);

const polygonGeometry = fc
	.tuple(
		berlinLngLat,
		fc.integer({ min: 300, max: 3000 }),
		fc.integer({ min: 300, max: 3000 }),
	)
	.map(([corner, width, height]): ConstraintGeometry => {
		const polygons: MultiPolygon = [
			[
				[
					corner,
					offsetLngLat(corner, width, 0),
					offsetLngLat(corner, width, height),
					offsetLngLat(corner, 0, height),
					corner,
				],
			],
		];
		return { kind: "polygon", polygons };
	});

const anyGeometry = fc.oneof(
	radiusGeometry,
	halfPlaneGeometry,
	sectorGeometry,
	polygonGeometry,
);

const anyConstraint = fc
	.tuple(
		anyGeometry,
		fc.constantFrom<"include" | "exclude">("include", "exclude"),
	)
	.map(
		([geometry, mode]): Constraint => ({
			id: `c${regionHash(toRegion(geometry)).slice(0, 12)}${mode}`,
			geometry,
			mode,
		}),
	);

function distanceToSegment(
	p: readonly [number, number],
	a: readonly [number, number],
	b: readonly [number, number],
): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
	const t = Math.max(
		0,
		Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared),
	);
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Is the point close enough to the constraint's edge that either answer is fair? */
function nearBoundary(point: LngLat, geometry: ConstraintGeometry): boolean {
	const toLocal = localFrame(point);
	switch (geometry.kind) {
		case "radius":
			return (
				Math.abs(distanceMeters(point, geometry.center) - geometry.radius) <
				BOUNDARY_CLEARANCE_METERS
			);
		case "halfPlane": {
			// The gap to the bisector is half the difference of the two distances.
			const gap =
				Math.abs(
					distanceMeters(point, geometry.a) - distanceMeters(point, geometry.b),
				) / 2;
			return gap < BOUNDARY_CLEARANCE_METERS;
		}
		case "sector": {
			if (
				Math.abs(distanceMeters(point, geometry.center) - geometry.radius) <
				BOUNDARY_CLEARANCE_METERS
			) {
				return true;
			}
			// The two straight edges of the pie slice.
			const center = toLocal(geometry.center);
			for (const bearing of [geometry.fromDeg, geometry.toDeg]) {
				const angle = ((90 - bearing) * Math.PI) / 180;
				const tip = toLocal(
					offsetLngLat(
						geometry.center,
						geometry.radius * Math.cos(angle),
						geometry.radius * Math.sin(angle),
					),
				);
				if (
					distanceToSegment([0, 0], center, tip) < BOUNDARY_CLEARANCE_METERS
				) {
					return true;
				}
			}
			return false;
		}
		case "polygon": {
			for (const polygon of geometry.polygons) {
				for (const ring of polygon) {
					for (let i = 0; i < ring.length - 1; i++) {
						const a = toLocal(ring[i] as LngLat);
						const b = toLocal(ring[i + 1] as LngLat);
						if (distanceToSegment([0, 0], a, b) < BOUNDARY_CLEARANCE_METERS) {
							return true;
						}
					}
				}
			}
			return false;
		}
	}
}

describe("satisfies and applyConstraint are two readings of one definition", () => {
	// m0-spec §12: the highest-value property test in the codebase.
	it("agrees for every generated point and constraint", () => {
		fc.assert(
			fc.property(anyConstraint, berlinLngLat, (constraint, point) => {
				fc.pre(!nearBoundary(point, constraint.geometry));

				const viaArea = regionContains(
					applyConstraint(WORLD_REGION, constraint),
					point,
				);
				expect(satisfies(point, constraint)).toBe(viaArea);
			}),
			{ numRuns: 300 },
		);
	});

	/**
	 * And the definition itself is the right one — checked against a real
	 * distance rather than against the polygon that drew it, which is the half
	 * the invariant above cannot see because both of its readings share a
	 * polygon.
	 */
	it("puts a radius constraint where the metres say it is", () => {
		fc.assert(
			fc.property(radiusGeometry, berlinLngLat, (geometry, point) => {
				fc.pre(!nearBoundary(point, geometry));
				const constraint: Constraint = { id: "r", geometry, mode: "include" };
				const inside =
					geometry.kind === "radius" &&
					distanceMeters(point, geometry.center) < geometry.radius;
				expect(satisfies(point, constraint)).toBe(inside);
			}),
			{ numRuns: 200 },
		);
	});
});

/** Area of (a \ b) ∪ (b \ a) — zero exactly when the two regions are the same set. */
function symmetricDifferenceArea(a: Region, b: Region): number {
	return regionArea(subtractRegions(a, b)) + regionArea(subtractRegions(b, a));
}

describe("the fold commutes", () => {
	const seed = toRegion({
		kind: "radius",
		center: [13.4, 52.52],
		radius: 8000,
	});

	it("yields the same set when applied in any order", () => {
		// The mathematical claim, tested without relying on the sort in
		// foldConstraints: every constraint is an intersection with some set, and
		// intersection is commutative.
		fc.assert(
			fc.property(
				fc.array(anyConstraint, { minLength: 2, maxLength: 4 }),
				fc.array(fc.integer(), { minLength: 4, maxLength: 4 }),
				(constraints, shuffleKeys) => {
					const shuffled = constraints
						.map((constraint, index) => ({
							constraint,
							key: shuffleKeys[index] ?? index,
						}))
						.sort((a, b) => a.key - b.key)
						.map((entry) => entry.constraint);

					const inOrder = constraints.reduce(
						(area, c) => applyConstraint(area, c),
						seed,
					);
					const outOfOrder = shuffled.reduce(
						(area, c) => applyConstraint(area, c),
						seed,
					);

					// Snapping and simplification leave slivers along the boundary, so
					// the two differ by an edge-width band and nothing more.
					const tolerance = Math.max(
						1,
						Math.max(regionArea(inOrder), regionArea(outOfOrder)) * 1e-3,
					);
					expect(symmetricDifferenceArea(inOrder, outOfOrder)).toBeLessThan(
						tolerance,
					);
				},
			),
			{ numRuns: 40 },
		);
	});

	it("yields identical geometry whatever the constraint order", () => {
		fc.assert(
			fc.property(
				fc.array(anyConstraint, { minLength: 2, maxLength: 5 }),
				fc.array(fc.integer(), { minLength: 5, maxLength: 5 }),
				(constraints, shuffleKeys) => {
					const shuffled = constraints
						.map((constraint, index) => ({
							constraint,
							key: shuffleKeys[index] ?? index,
						}))
						.sort((a, b) => a.key - b.key)
						.map((entry) => entry.constraint);

					expect(regionHash(foldConstraints(seed, shuffled))).toBe(
						regionHash(foldConstraints(seed, constraints)),
					);
				},
			),
			{ numRuns: 60 },
		);
	});

	it("makes disabling a middle constraint independent of position", () => {
		const constraints: Constraint[] = [
			{
				id: "a",
				mode: "include",
				geometry: { kind: "radius", center: [13.4, 52.52], radius: 5000 },
			},
			{
				id: "b",
				mode: "exclude",
				geometry: { kind: "radius", center: [13.42, 52.53], radius: 1200 },
			},
			{
				id: "c",
				mode: "include",
				geometry: {
					kind: "halfPlane",
					a: [13.38, 52.5],
					b: [13.45, 52.55],
					nearer: "a",
				},
			},
		];

		// Dropping the middle one is the whole of "disabling" — no reordering.
		const withoutB = [
			constraints[0] as Constraint,
			constraints[2] as Constraint,
		];
		const reordered = [
			constraints[2] as Constraint,
			constraints[0] as Constraint,
		];

		expect(regionHash(foldConstraints(seed, withoutB))).toBe(
			regionHash(foldConstraints(seed, reordered)),
		);
	});
});

describe("the fold is idempotent", () => {
	const seed = toRegion({
		kind: "radius",
		center: [13.4, 52.52],
		radius: 8000,
	});

	it("returns byte-identical output when a constraint is disabled and re-enabled", () => {
		const constraints: Constraint[] = [
			{
				id: "a",
				mode: "include",
				geometry: { kind: "radius", center: [13.4, 52.52], radius: 4000 },
			},
			{
				id: "b",
				mode: "exclude",
				geometry: { kind: "radius", center: [13.43, 52.53], radius: 900 },
			},
		];

		const before = foldConstraints(seed, constraints);
		const disabled = foldConstraints(seed, [constraints[0] as Constraint]);
		const after = foldConstraints(seed, constraints);

		expect(regionHash(after)).toBe(regionHash(before));
		expect(regionHash(disabled)).not.toBe(regionHash(before));
	});

	it("computes the same geometry on every evaluation", () => {
		fc.assert(
			fc.property(anyGeometry, (geometry) => {
				expect(regionHash(toRegion(geometry))).toBe(
					regionHash(toRegion(geometry)),
				);
			}),
			{ numRuns: 100 },
		);
	});
});

describe("radar", () => {
	const alex: LngLat = [13.4132, 52.5219];
	const seed = toRegion({ kind: "radius", center: alex, radius: 10000 });

	it("keeps the disc on yes and carves it out on no", () => {
		const yes: Constraint = {
			id: "yes",
			mode: "include",
			geometry: { kind: "radius", center: alex, radius: 3000 },
		};
		const no: Constraint = { ...yes, id: "no", mode: "exclude" };

		const kept = applyConstraint(seed, yes);
		const carved = applyConstraint(seed, no);

		expect(regionContains(kept, alex)).toBe(true);
		expect(regionContains(carved, alex)).toBe(false);
		expect(regionArea(kept) + regionArea(carved)).toBeCloseTo(
			regionArea(seed),
			-1,
		);
	});
});
