import type { Transaction } from "@rocicorp/zero";
import { describe, expect, it } from "vitest";
import type { MutationRejection } from "../types";
import {
	refuse,
	requireHost,
	requireTeamEditor,
	requireTeamMember,
} from "./guards";

/**
 * The permission guards. m1-spec §12.
 *
 * These test the decision and not the query wiring — the guards take a
 * transaction only to read one row and to know where they are running, so the
 * fake below answers `run` from a script. That the queries select the right rows
 * is what the acceptance suite is for.
 */

type Where = Transaction["location"];
type Reason = Transaction["reason"];

/** Answers `tx.run` from a list, in call order. */
function fakeTx(location: Where, reason: Reason, rows: readonly unknown[]) {
	let next = 0;
	return {
		location,
		reason,
		run: async () => rows[next++],
	} as unknown as Transaction;
}

const optimistic = (rows: readonly unknown[]) =>
	fakeTx("client", "optimistic", rows);
const rebasing = (rows: readonly unknown[]) => fakeTx("client", "rebase", rows);
const authoritative = (rows: readonly unknown[]) =>
	fakeTx("server", "authoritative", rows);

function rejectionFrom(error: unknown): MutationRejection | undefined {
	if (error instanceof Error && "details" in error) {
		return error.details as MutationRejection;
	}
	return undefined;
}

async function refusalOf(run: () => Promise<void>): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (error) {
		const rejection = rejectionFrom(error);
		if (rejection?.code !== "not_permitted") throw error;
		return rejection.reason;
	}
}

describe("requireHost", () => {
	it("lets a host through", async () => {
		const tx = authoritative([{ id: "p1", isHost: true }]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).toBe(null);
	});

	it("refuses a player who is not host", async () => {
		const tx = authoritative([{ id: "p1", isHost: false }]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).toContain("creating a team");
	});

	it("refuses optimistically too, so the write never reaches the screen", async () => {
		const tx = optimistic([{ id: "p1", isHost: false }]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).not.toBe(null);
	});

	/**
	 * The one case where refusing would be worse than allowing: by rebase time the
	 * server has already decided, and throwing fails the whole poke. m0-spec §7.
	 */
	it("stays silent during a rebase", async () => {
		const tx = rebasing([{ id: "p1", isHost: false }]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).toBe(null);
	});

	it("treats an unsynced player row on a client as ignorance, not refusal", async () => {
		const tx = optimistic([undefined]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).toBe(null);
	});

	it("treats a missing player row on the server as a refusal", async () => {
		const tx = authoritative([undefined]);
		expect(
			await refusalOf(() => requireHost(tx, "p1", "creating a team")),
		).not.toBe(null);
	});
});

describe("requireTeamMember", () => {
	it("lets a member of that team through", async () => {
		const tx = authoritative([{ teamId: "t1", playerId: "p1" }]);
		expect(
			await refusalOf(() =>
				requireTeamMember(tx, "p1", "t1", "editing a team"),
			),
		).toBe(null);
	});

	it("refuses somebody who is not on that team", async () => {
		const tx = authoritative([undefined]);
		expect(
			await refusalOf(() =>
				requireTeamMember(tx, "p1", "t1", "editing a team"),
			),
		).toContain("editing a team");
	});

	it("says nothing when the client has not synced the team either", async () => {
		// No membership, and no team — which on a client means it does not know,
		// rather than that the answer is no.
		const tx = optimistic([undefined, undefined]);
		expect(
			await refusalOf(() =>
				requireTeamMember(tx, "p1", "t1", "editing a team"),
			),
		).toBe(null);
	});

	it("refuses when the client knows the team and is not on it", async () => {
		const tx = optimistic([undefined, { id: "t1" }]);
		expect(
			await refusalOf(() =>
				requireTeamMember(tx, "p1", "t1", "editing a team"),
			),
		).not.toBe(null);
	});
});

describe("requireTeamEditor", () => {
	it("lets a member of that team through", async () => {
		const tx = authoritative([{ teamId: "t1", playerId: "p1" }]);
		expect(
			await refusalOf(() =>
				requireTeamEditor(tx, "p1", "t1", "editing a team"),
			),
		).toBe(null);
	});

	it("lets a host rename a team nobody is on yet", async () => {
		const tx = authoritative([undefined, [], { id: "p1", isHost: true }]);
		expect(
			await refusalOf(() =>
				requireTeamEditor(tx, "p1", "t1", "editing a team"),
			),
		).toBe(null);
	});

	it("refuses a non-host who is not on an empty team", async () => {
		const tx = authoritative([undefined, [], { id: "p1", isHost: false }]);
		expect(
			await refusalOf(() =>
				requireTeamEditor(tx, "p1", "t1", "editing a team"),
			),
		).toContain("editing a team");
	});

	it("refuses a host who is not on an occupied team", async () => {
		const tx = authoritative([undefined, [{ teamId: "t1", playerId: "p2" }]]);
		expect(
			await refusalOf(() =>
				requireTeamEditor(tx, "p1", "t1", "editing a team"),
			),
		).toContain("own members");
	});

	it("says nothing when the client has not synced the team either", async () => {
		const tx = optimistic([undefined, [], undefined]);
		expect(
			await refusalOf(() =>
				requireTeamEditor(tx, "p1", "t1", "editing a team"),
			),
		).toBe(null);
	});
});

describe("refuse", () => {
	it("carries the rejection shape m0-spec §7 defined", async () => {
		const tx = authoritative([]);
		let caught: MutationRejection | undefined;
		try {
			refuse(tx, { code: "not_permitted", reason: "because" });
		} catch (error) {
			caught = rejectionFrom(error);
		}
		expect(caught).toEqual({ code: "not_permitted", reason: "because" });
	});
});
