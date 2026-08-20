import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { drizzleSchema } from "./drizzle";
import { EVENT_TYPES, type RoundStatus } from "./types";
import { schema } from "./zero/schema";

/**
 * Drizzle owns the DDL and the Zero schema is derived from it by hand (§5).
 * Hand-derivation buys typed `json()` columns and costs the guarantee a
 * generator would give, so this test buys the guarantee back: rename a column
 * in one place and it fails here rather than at runtime, three milestones later,
 * as a row that silently stops syncing.
 */

const drizzleTables = Object.values(drizzleSchema).map((table) => {
	const config = getTableConfig(table);
	return {
		name: config.name,
		columns: config.columns.map((column) => column.name).sort(),
		primaryKey: [
			...config.columns.filter((column) => column.primary).map((c) => c.name),
			...config.primaryKeys.flatMap((key) => key.columns.map((c) => c.name)),
		].sort(),
	};
});

const zeroTables = Object.entries(schema.tables).map(([name, table]) => ({
	name,
	columns: Object.keys(table.columns).sort(),
	primaryKey: [...table.primaryKey].sort(),
}));

describe("the Zero schema tracks the Drizzle schema", () => {
	it("declares the same tables", () => {
		expect(zeroTables.map((t) => t.name).sort()).toEqual(
			drizzleTables.map((t) => t.name).sort(),
		);
	});

	it.each(drizzleTables)("declares the same columns for $name", (table) => {
		const zeroTable = zeroTables.find((t) => t.name === table.name);
		expect(zeroTable?.columns).toEqual(table.columns);
	});

	it.each(drizzleTables)("declares the same primary key for $name", (table) => {
		const zeroTable = zeroTables.find((t) => t.name === table.name);
		expect(zeroTable?.primaryKey).toEqual(table.primaryKey);
	});
});

describe("Postgres object names", () => {
	// zero-cache silently drops anything that does not match. m0-spec §3's
	// deployment notes are the kind that bite once and never again.
	const valid = /^[A-Za-z_]+[A-Za-z0-9_-]*$/;

	it.each(drizzleTables)("$name is syncable", (table) => {
		expect(table.name).toMatch(valid);
		for (const column of table.columns) {
			expect(column).toMatch(valid);
			expect(column).not.toBe("_0_version");
		}
	});
});

describe("first to the server wins", () => {
	it("is backed by a unique index on answer.questionId", () => {
		const answer = getTableConfig(drizzleSchema.answer);
		const unique = answer.indexes.find((index) => index.config.unique);
		expect(
			unique?.config.columns.map((c) => ("name" in c ? c.name : c)),
		).toEqual(["questionId"]);
	});
});

describe("one player, one team", () => {
	/**
	 * Not a data-integrity nicety — this index *is* the invariant. A `player` row
	 * belongs to exactly one game, so uniqueness on `playerId` says "one team per
	 * player per game" without a composite key. m1-spec §5.
	 */
	it("is backed by a unique index on teamMember.playerId", () => {
		const teamMember = getTableConfig(drizzleSchema.teamMember);
		const unique = teamMember.indexes.find((index) => index.config.unique);
		expect(
			unique?.config.columns.map((c) => ("name" in c ? c.name : c)),
		).toEqual(["playerId"]);
	});
});

describe("the M3 map toolkit schema", () => {
	it("indexes pins by their game and owning team", () => {
		const pin = getTableConfig(drizzleSchema.pin);
		const teamIndex = pin.indexes.find(
			(index) => index.config.name === "pin_team_idx",
		);
		expect(
			teamIndex?.config.columns.map((c) => ("name" in c ? c.name : c)),
		).toEqual(["gameId", "teamId"]);
	});

	it("allows one search zone per seeker team per round", () => {
		const searchZone = getTableConfig(drizzleSchema.searchZone);
		const unique = searchZone.indexes.find(
			(index) => index.config.name === "searchZone_round_team_idx",
		);
		expect(unique?.config.unique).toBe(true);
		expect(
			unique?.config.columns.map((c) => ("name" in c ? c.name : c)),
		).toEqual(["roundId", "seekerTeamId"]);
	});

	it("declares every map-tool event", () => {
		expect(EVENT_TYPES).toEqual(
			expect.arrayContaining([
				"pin.created",
				"pin.updated",
				"pin.deleted",
				"searchZone.declared",
				"searchZone.cleared",
			]),
		);
	});
});

describe("the M1 vocabulary", () => {
	it("declares the events M1 emits", () => {
		expect(EVENT_TYPES).toContain("host.changed");
		expect(EVENT_TYPES).toContain("player.removed");
		expect(EVENT_TYPES).toContain("team.deleted");
	});

	/**
	 * M0 declared it and never emitted it, which is why replacing it with
	 * `host.changed` costs nothing and owes nobody a version bump. m1-spec §2.
	 */
	it("no longer declares host.transferred", () => {
		expect(EVENT_TYPES).not.toContain("host.transferred");
	});

	it("has a round status for a round that exists but has not begun", () => {
		const pending: RoundStatus = "pending";
		expect(pending).toBe("pending");
	});

	it("carries the departure and host columns on player", () => {
		const player = getTableConfig(drizzleSchema.player);
		const columns = player.columns.map((column) => column.name);
		expect(columns).toEqual(
			expect.arrayContaining(["isHost", "leftAt", "removedByPlayerId"]),
		);
	});
});
