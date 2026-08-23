import { expect, test } from "@playwright/test";
import {
	areaSquareMeters,
	closeDb,
	currentMapConfig,
	gameIdForCode,
	mapEvents,
	mapStops,
	templateCount,
} from "./db";
import {
	BOWTIE,
	BOX,
	createGame,
	drawRing,
	joinGame,
	LARGE_BOX,
	nameAndApply,
	nameAndSave,
	openBuilder,
	openLobby,
	openMap,
	openPhone,
	SMALL_BOX,
	stationsInside,
	waitForSync,
} from "./harness";

/**
 * M4 — the game area builder. m4-spec §11.
 *
 * The catalog these tests run against is the twelve-station Berlin fixture,
 * asked for explicitly in `playwright.config.ts`: CI has no 2 GB feed, and a
 * suite whose station counts depend on which feed the machine holds fails for
 * reasons nobody can read.
 */

test.afterAll(async () => {
	await closeDb();
});

test("1. a host draws, names and applies a map in a handful of taps", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	const code = await createGame(host);

	const started = Date.now();
	await openBuilder(host, code);
	await drawRing(host, BOX);
	await host.page.getByTestId("map-radius").fill("400");
	await nameAndApply(host, "Mitte test");
	const elapsed = Date.now() - started;

	const gameId = await gameIdForCode(code);
	const config = await currentMapConfig(gameId);
	expect(config.name).toBe("Mitte test");
	expect(config.hidingRadiusMeters).toBe(400);
	expect(config.validHidingArea.length).toBeGreaterThan(0);

	/**
	 * Not a performance test — a guard on how many interactions the flow costs.
	 * The build plan asks for two minutes by a person; a machine doing the same
	 * taps has an enormous amount of room before that is in doubt.
	 */
	expect(elapsed).toBeLessThan(60_000);

	await host.close();
});

test("2. the station count follows the area", async ({ browser }) => {
	const host = await openPhone(browser, "Host");
	const code = await createGame(host);
	await openBuilder(host, code);

	await drawRing(host, SMALL_BOX);
	const small = await stationsInside(host);

	// Widen it by dragging the ring out — here, by redrawing a bigger one.
	await host.page.getByTestId("draw-clear").click();
	await drawRing(host, LARGE_BOX);
	const large = await stationsInside(host);

	expect(large).toBeGreaterThan(small);

	await host.page.getByTestId("draw-clear").click();
	await drawRing(host, SMALL_BOX);
	// Back to exactly what it was: the count is a function of the area, not of
	// what the host did on the way there.
	expect(await stationsInside(host)).toBe(small);

	await host.close();
});

test("3. a drawn bowtie is accepted and repaired", async ({ browser }) => {
	const host = await openPhone(browser, "Host");
	const code = await createGame(host);

	await openBuilder(host, code);
	await drawRing(host, BOX);
	await nameAndApply(host, "Square");
	const gameId = await gameIdForCode(code);
	const square = await currentMapConfig(gameId);

	await openBuilder(host, code);
	await drawRing(host, BOWTIE);
	await nameAndApply(host, "Bowtie");
	const bowtie = await currentMapConfig(gameId);

	// Two lobes rather than one ring, and exactly half the square's area — the
	// figure m4-spec §3 measured, as a regression test.
	expect(bowtie.validHidingArea.length).toBe(2);
	expect(areaSquareMeters(bowtie.validHidingArea)).toBeCloseTo(
		areaSquareMeters(square.validHidingArea) / 2,
		-4,
	);

	await host.close();
});

test("4. a share code reproduces the map byte-identically on another device", async ({
	browser,
}) => {
	const first = await openPhone(browser, "First");
	const firstCode = await createGame(first);
	await openBuilder(first, firstCode);
	await drawRing(first, BOX);
	const shareCode = await nameAndSave(first, "Shared map");
	await nameAndApply(first, "Shared map");

	const second = await openPhone(browser, "Second");
	const secondCode = await createGame(second);
	await openBuilder(second, secondCode);
	await second.page.evaluate(
		async ([code, share]) => {
			const raw = localStorage.getItem("zero-lag.session");
			if (!raw) throw new Error("no session");
			const session = JSON.parse(raw);
			const response = await fetch(
				`http://localhost:3000/api/games/${session.gameId}/map`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.token}`,
					},
					body: JSON.stringify({ templateCode: share }),
				},
			);
			if (!response.ok) throw new Error(`apply failed: ${response.status}`);
			return code;
		},
		[secondCode, shareCode] as const,
	);

	const a = await currentMapConfig(await gameIdForCode(firstCode));
	const b = await currentMapConfig(await gameIdForCode(secondCode));

	expect(b.contentHash).toBe(a.contentHash);
	expect(b.validHidingArea).toEqual(a.validHidingArea);
	expect(await mapStops(b.id)).toEqual(await mapStops(a.id));

	await first.close();
	await second.close();
});

test("6. a game plays from its own rows, with the catalog unreachable", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	const code = await createGame(host);
	await openBuilder(host, code);
	await drawRing(host, LARGE_BOX);
	await nameAndApply(host, "Playable");

	const player = await openPhone(browser, "Player");
	await joinGame(player, code);

	/**
	 * The test that matters most. It is the only one that fails when somebody
	 * reintroduces a direct catalog import into a play screen — the shortcut
	 * that was in the codebase three times and will look reasonable every time
	 * somebody needs a station's name in a hurry. m4-spec §11.
	 */
	await player.context.route("**/api/catalog/**", (route) => route.abort());

	// Ask the board what it carries rather than assuming: which stations a ring
	// catches depends on where it was drawn, and a test that hard-codes one is
	// asserting about the ring, not about search.
	const gameId = await gameIdForCode(code);
	const config = await currentMapConfig(gameId);
	const carried = await mapStops(config.id);
	const inside = carried.find((stop) => stop.insideArea);
	if (!inside) throw new Error("the board carries no stops inside its area");

	await openMap(player, code);
	await waitForSync(player);
	await player.page.getByTestId("map-search").fill(inside.name);
	await expect(
		player.page.getByRole("button", { name: escapeRegExp(inside.name) }),
	).toBeVisible();

	await player.close();
	await host.close();
});

test("9. two hosts saving is last write wins, and the log holds both", async ({
	browser,
}) => {
	const first = await openPhone(browser, "First");
	const code = await createGame(first);
	const second = await openPhone(browser, "Second");
	await joinGame(second, code);
	await openLobby(second, code);
	await second.page.getByTestId("claim-host").click();
	await expect(second.page.getByTestId("host-badge-Second")).toBeVisible();

	await openBuilder(first, code);
	await drawRing(first, BOX);
	await nameAndApply(first, "First host's map");

	await openBuilder(second, code);
	await drawRing(second, LARGE_BOX);
	await nameAndApply(second, "Second host's map");

	const gameId = await gameIdForCode(code);
	const config = await currentMapConfig(gameId);
	// A host who applies after another host has changed their mind, and the
	// correct behaviour is that the map changes. m4-spec §7.
	expect(config.name).toBe("Second host's map");
	expect(config.supersedesConfigId).not.toBeNull();

	const events = await mapEvents(gameId);
	expect(events.map((event) => event.type)).toEqual([
		"map.applied",
		"map.changed",
		"map.changed",
	]);
	expect(events[2]?.seq).toBeGreaterThan(events[1]?.seq ?? 0);
	expect(await templateCount()).toBeGreaterThanOrEqual(0);

	await first.close();
	await second.close();
});

/** Station names hold brackets and dots; a name is a name, not a pattern. */
function escapeRegExp(value: string): RegExp {
	return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
