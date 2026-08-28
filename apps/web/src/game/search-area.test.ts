import { multiPolygonToRegion, regionHash } from "@zero-lag/geo";
import { type Constraint, foldConstraints } from "@zero-lag/rules";
import { describe, expect, it } from "vitest";
import { survivingSearchArea } from "./search-area";

const SEED = [
	[
		[
			[13.3, 52.45],
			[13.5, 52.45],
			[13.5, 52.55],
			[13.3, 52.55],
			[13.3, 52.45],
		],
	],
] as const;

const INCLUDE_RADIUS: Constraint = {
	id: "a",
	mode: "include",
	geometry: { kind: "radius", centers: [[13.4, 52.5]], radius: 4000 },
};

const EXCLUDE_POLYGON: Constraint = {
	id: "b",
	mode: "exclude",
	geometry: {
		kind: "polygon",
		polygons: [
			[
				[
					[13.41, 52.51],
					[13.43, 52.51],
					[13.43, 52.53],
					[13.41, 52.53],
					[13.41, 52.51],
				],
			],
		],
	},
};

describe("survivingSearchArea", () => {
	it("with no constraints is the seed, hashed identically to a bare fold", () => {
		const area = survivingSearchArea(SEED, [], "hider-1");
		const folded = foldConstraints(multiPolygonToRegion(SEED), []);
		expect(area.hash).toBe(regionHash(folded));
		expect(area.surviving).toEqual(folded);
		expect(area.eliminated).not.toBeNull();
	});

	it("include then exclude matches a hand fold", () => {
		const rows = [
			{ ...INCLUDE_RADIUS, hiderTeamId: "hider-1", enabled: true },
			{ ...EXCLUDE_POLYGON, hiderTeamId: "hider-1", enabled: true },
		];
		const area = survivingSearchArea(SEED, rows, "hider-1");
		const folded = foldConstraints(multiPolygonToRegion(SEED), [
			INCLUDE_RADIUS,
			EXCLUDE_POLYGON,
		]);
		expect(area.hash).toBe(regionHash(folded));
	});

	it("disabling one constraint restores the previous region", () => {
		const both = [
			{ ...INCLUDE_RADIUS, hiderTeamId: "hider-1", enabled: true },
			{ ...EXCLUDE_POLYGON, hiderTeamId: "hider-1", enabled: true },
		];
		const disabled = [
			{ ...INCLUDE_RADIUS, hiderTeamId: "hider-1", enabled: true },
			{ ...EXCLUDE_POLYGON, hiderTeamId: "hider-1", enabled: false },
		];
		const afterDisable = survivingSearchArea(SEED, disabled, "hider-1");
		const onlyInclude = foldConstraints(multiPolygonToRegion(SEED), [
			INCLUDE_RADIUS,
		]);
		expect(afterDisable.hash).toBe(regionHash(onlyInclude));
		expect(survivingSearchArea(SEED, both, "hider-1").hash).not.toBe(
			afterDisable.hash,
		);
	});

	it("ignores another hider team's constraints", () => {
		const rows = [{ ...INCLUDE_RADIUS, hiderTeamId: "hider-2", enabled: true }];
		const forOne = survivingSearchArea(SEED, rows, "hider-1");
		const empty = survivingSearchArea(SEED, [], "hider-1");
		expect(forOne.hash).toBe(empty.hash);
	});
});
