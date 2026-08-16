import {
	BERLIN_PROJECTION,
	createProjector,
	type LngLat,
	type MultiPolygon,
	type Region,
	regionArea,
	regionContainsXY,
	regionHash,
	subtractRegions,
	WORLD_REGION,
	type XY,
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

const projection = BERLIN_PROJECTION;
const projector = createProjector(projection);

/**
 * Snapping and simplification move vertices, so a point sitting within a metre
 * or two of a boundary can legitimately land on either side. That is a
 * property of the numerical hygiene the engine is required to do, not a defect
 * in it, so generated points are kept clear of the edge.
 */
const BOUNDARY_CLEARANCE_METERS = 10;

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
		const [x, y] = projector.forward(corner);
		const ring: XY[] = [
			[x, y],
			[x + width, y],
			[x + width, y + height],
			[x, y + height],
			[x, y],
		];
		const polygons: MultiPolygon = [
			[ring.map((point) => projector.inverse(point))],
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
			id: `c${regionHash(toRegion(geometry, projection)).slice(0, 12)}${mode}`,
			geometry,
			mode,
		}),
	);

function distanceMeters(a: LngLat, b: LngLat): number {
	const pa = projector.forward(a);
	const pb = projector.forward(b);
	return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
}

function distanceToSegment(p: XY, a: XY, b: XY): number {
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
	const p = projector.forward(point);
	switch (geometry.kind) {
		case "radius": {
			const c = projector.forward(geometry.center);
			const distance = Math.hypot(p[0] - c[0], p[1] - c[1]);
			return Math.abs(distance - geometry.radius) < BOUNDARY_CLEARANCE_METERS;
		}
		case "halfPlane": {
			const a = projector.forward(geometry.a);
			const b = projector.forward(geometry.b);
			const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const mx = (a[0] + b[0]) / 2;
			const my = (a[1] + b[1]) / 2;
			const signed =
				((p[0] - mx) * (b[0] - a[0]) + (p[1] - my) * (b[1] - a[1])) / length;
			return Math.abs(signed) < BOUNDARY_CLEARANCE_METERS;
		}
		case "sector": {
			const c = projector.forward(geometry.center);
			const distance = Math.hypot(p[0] - c[0], p[1] - c[1]);
			if (Math.abs(distance - geometry.radius) < BOUNDARY_CLEARANCE_METERS) {
				return true;
			}
			// The two straight edges of the pie slice.
			for (const bearing of [geometry.fromDeg, geometry.toDeg]) {
				const angle = ((90 - bearing) * Math.PI) / 180;
				const tip: XY = [
					c[0] + geometry.radius * Math.cos(angle),
					c[1] + geometry.radius * Math.sin(angle),
				];
				if (distanceToSegment(p, c, tip) < BOUNDARY_CLEARANCE_METERS) {
					return true;
				}
			}
			return false;
		}
		case "polygon": {
			for (const polygon of geometry.polygons) {
				for (const ring of polygon) {
					for (let i = 0; i < ring.length - 1; i++) {
						const a = projector.forward(ring[i] as LngLat);
						const b = projector.forward(ring[i + 1] as LngLat);
						if (distanceToSegment(p, a, b) < BOUNDARY_CLEARANCE_METERS) {
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

				const viaArea = regionContainsXY(
					applyConstraint(WORLD_REGION, constraint, projection),
					projector.forward(point),
				);
				expect(satisfies(point, constraint, projection)).toBe(viaArea);
			}),
			{ numRuns: 300 },
		);
	});
});

/** Area of (a \ b) ∪ (b \ a) — zero exactly when the two regions are the same set. */
function symmetricDifferenceArea(a: Region, b: Region): number {
	return regionArea(subtractRegions(a, b)) + regionArea(subtractRegions(b, a));
}

describe("the fold commutes", () => {
	it("yields the same set when applied in any order", () => {
		// The mathematical claim, tested without relying on the sort in
		// foldConstraints: every constraint is an intersection with some set, and
		// intersection is commutative.
		fc.assert(
			fc.property(
				fc.array(anyConstraint, { minLength: 2, maxLength: 4 }),
				fc.array(fc.integer(), { minLength: 4, maxLength: 4 }),
				(constraints, shuffleKeys) => {
					const seed = toRegion(
						{ kind: "radius", center: [13.4, 52.52], radius: 8000 },
						projection,
					);
					const shuffled = constraints
						.map((constraint, index) => ({
							constraint,
							key: shuffleKeys[index] ?? index,
						}))
						.sort((a, b) => a.key - b.key)
						.map((entry) => entry.constraint);

					const inOrder = constraints.reduce(
						(area, c) => applyConstraint(area, c, projection),
						seed,
					);
					const outOfOrder = shuffled.reduce(
						(area, c) => applyConstraint(area, c, projection),
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
					const seed = toRegion(
						{ kind: "radius", center: [13.4, 52.52], radius: 8000 },
						projection,
					);
					const shuffled = constraints
						.map((constraint, index) => ({
							constraint,
							key: shuffleKeys[index] ?? index,
						}))
						.sort((a, b) => a.key - b.key)
						.map((entry) => entry.constraint);

					expect(regionHash(foldConstraints(seed, shuffled, projection))).toBe(
						regionHash(foldConstraints(seed, constraints, projection)),
					);
				},
			),
			{ numRuns: 60 },
		);
	});

	it("makes disabling a middle constraint independent of position", () => {
		const seed = toRegion(
			{ kind: "radius", center: [13.4, 52.52], radius: 8000 },
			projection,
		);
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

		expect(regionHash(foldConstraints(seed, withoutB, projection))).toBe(
			regionHash(foldConstraints(seed, reordered, projection)),
		);
	});
});

describe("the fold is idempotent", () => {
	it("returns byte-identical output when a constraint is disabled and re-enabled", () => {
		const seed = toRegion(
			{ kind: "radius", center: [13.4, 52.52], radius: 8000 },
			projection,
		);
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

		const before = foldConstraints(seed, constraints, projection);
		const disabled = foldConstraints(
			seed,
			[constraints[0] as Constraint],
			projection,
		);
		const after = foldConstraints(seed, constraints, projection);

		expect(regionHash(after)).toBe(regionHash(before));
		expect(regionHash(disabled)).not.toBe(regionHash(before));
	});

	it("computes the same geometry on every evaluation", () => {
		fc.assert(
			fc.property(anyGeometry, (geometry) => {
				expect(regionHash(toRegion(geometry, projection))).toBe(
					regionHash(toRegion(geometry, projection)),
				);
			}),
			{ numRuns: 100 },
		);
	});
});

describe("radar", () => {
	const alex: LngLat = [13.4132, 52.5219];
	const seed = toRegion(
		{ kind: "radius", center: alex, radius: 10000 },
		projection,
	);

	it("keeps the disc on yes and carves it out on no", () => {
		const yes: Constraint = {
			id: "yes",
			mode: "include",
			geometry: { kind: "radius", center: alex, radius: 3000 },
		};
		const no: Constraint = { ...yes, id: "no", mode: "exclude" };

		const kept = applyConstraint(seed, yes, projection);
		const carved = applyConstraint(seed, no, projection);

		expect(regionContainsXY(kept, projector.forward(alex))).toBe(true);
		expect(regionContainsXY(carved, projector.forward(alex))).toBe(false);
		expect(regionArea(kept) + regionArea(carved)).toBeCloseTo(
			regionArea(seed),
			-1,
		);
	});
});
