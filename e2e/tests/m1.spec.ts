import { expect, test } from "@playwright/test";
import {
	closeDb,
	gameIdForCode,
	playerIdForName,
	roundStatuses,
	teamMembershipCount,
} from "./db";
import {
	createGame,
	createTeam,
	joinGame,
	joinRefused,
	joinTeam,
	openDebug,
	openPhone,
	type Phone,
	presenceOf,
	sawPresence,
	waitForSync,
} from "./harness";

/**
 * The M1 acceptance suite. m1-spec §12.
 *
 * Five browser contexts, one per phone, because "five phones join and the host
 * builds the structure they want" is the milestone and three would not prove it.
 *
 * Tests 7 and 8 together are the regression guard for §9 — one proves the roster
 * is not filtered, the other proves the coordinates are.
 *
 * The spec's tenth test is `m0.spec.ts` itself: the M0 suite still passes, with
 * role assignment now flowing through the pending round. It is a file rather
 * than a case here, so it is not repeated.
 */

test.afterAll(async () => {
	await closeDb();
});

/** Assign a side from the lobby's role panel. Host only. */
async function setSide(
	phone: Phone,
	team: string,
	side: "hider" | "seeker",
): Promise<void> {
	await phone.page.getByTestId(`${side}-${team}`).click();
	// Read back off the team's own card rather than the button that was pressed,
	// so this asserts the round's assignment rather than the click.
	await expect(phone.page.getByTestId(`role-${team}`)).toHaveText(side);
}

test("1. five phones build two hider teams and three seeker teams", async ({
	browser,
}) => {
	const names = ["Ana", "Ben", "Cara", "Dev", "Eli"];
	const phones: Phone[] = [];
	for (const name of names) phones.push(await openPhone(browser, name));
	const [ana, ben, cara, dev, eli] = phones as [
		Phone,
		Phone,
		Phone,
		Phone,
		Phone,
	];

	const code = await createGame(ana);
	for (const phone of [ben, cara, dev, eli]) await joinGame(phone, code);
	for (const phone of phones) await waitForSync(phone);

	const teams = ["Foxes", "Owls", "Bees", "Sharks", "Turtles"];
	for (const team of teams) await createTeam(ana, team);

	await joinTeam(ana, "Foxes");
	await joinTeam(ben, "Owls");
	await joinTeam(cara, "Bees");
	await joinTeam(dev, "Sharks");
	await joinTeam(eli, "Turtles");

	await setSide(ana, "Foxes", "hider");
	await setSide(ana, "Owls", "hider");
	await setSide(ana, "Bees", "seeker");
	await setSide(ana, "Sharks", "seeker");
	await setSide(ana, "Turtles", "seeker");

	/**
	 * The same order on every device. Teams are ordered by `createdAt`, so this
	 * is the order they were made in — and a rename later on does not reshuffle
	 * it under somebody's thumb. m1-spec §2.
	 */
	for (const phone of phones) {
		const rendered = phone.page
			.getByTestId("teams")
			.locator(":scope > li > section");
		await expect(rendered).toHaveCount(teams.length);
		for (const [index, team] of teams.entries()) {
			await expect(rendered.nth(index)).toHaveAttribute(
				"data-testid",
				`team-${team}`,
			);
		}
	}

	// Distinct colours and emoji, chosen by the picker rather than typed in.
	const swatches = await ana.page
		.getByTestId("teams")
		.locator("[data-team-color]")
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("data-team-color")),
		);
	expect(new Set(swatches).size).toBe(teams.length);

	// Roles live on the pending round 1, created with the game. m1-spec §3.
	expect(await roundStatuses(await gameIdForCode(code))).toEqual(["pending"]);

	for (const phone of phones) await phone.close();
});

test("2. switching teams is a move, and every phone sees it", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await createTeam(ana, "Foxes");
	await createTeam(ana, "Owls");
	await expect(ben.page.getByTestId("team-Owls")).toBeVisible();

	await joinTeam(ben, "Foxes");
	await expect(
		ana.page.getByTestId("members-Foxes").getByTestId("player-Ben"),
	).toBeVisible();

	await joinTeam(ben, "Owls");

	// Everyone else, without a reload.
	await expect(
		ana.page.getByTestId("members-Owls").getByTestId("player-Ben"),
	).toBeVisible();
	await expect(
		ana.page.getByTestId("members-Foxes").getByTestId("player-Ben"),
	).toHaveCount(0);

	/**
	 * And the table agrees. M0 upserted the membership and left the old one
	 * standing, which made a player a seeker on one device and a hider on
	 * another — a bug that reads as a sync failure. m1-spec §5.
	 */
	const benId = await playerIdForName(code, "Ben");
	await expect.poll(() => teamMembershipCount(benId)).toBe(1);

	await ana.close();
	await ben.close();
});

test("3. a team edits itself; a stranger and a non-host are refused", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await createTeam(ana, "Foxes");
	await joinTeam(ben, "Foxes");

	// A non-host member renames their own team and recolours it.
	await ben.page.getByTestId("edit-Foxes").click();
	await ben.page.getByTestId("team-name-input").fill("Vixens");
	await ben.page.getByTestId("team-name-input").press("Enter");
	await ben.page.getByTestId("color-#0072B2").click();
	await ben.page.getByTestId("team-editor-done").click();

	await expect(ana.page.getByTestId("team-Vixens")).toBeVisible();
	await expect(
		ana.page.getByTestId("team-Vixens").locator("[data-team-color]"),
	).toHaveAttribute("data-team-color", "#0072B2");

	// Ana is host, but she is not on that team — and how a team presents itself
	// is the team's business. m1-spec §4.
	await ana.page.getByTestId("edit-Vixens").click();
	await ana.page.getByTestId("team-name-input").fill("Hers");
	await ana.page.getByTestId("team-name-input").press("Enter");
	await expect(ana.page.getByTestId("rejection-notice")).toBeVisible();
	await expect(ana.page.getByTestId("rejection-notice")).toContainText(
		"own members",
	);
	await ana.page.getByTestId("dismiss-rejection").click();
	await expect(ben.page.getByTestId("team-Vixens")).toBeVisible();

	// And creating a team is the host's, because team count is gameplay.
	await expect(ben.page.getByTestId("create-team")).toHaveCount(0);

	await ana.close();
	await ben.close();
});

test("4. the host hat is claimable, releasable, and may sit on nobody", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await expect(ana.page.getByTestId("host-badge-Ana")).toBeVisible();
	await expect(ben.page.getByTestId("create-team")).toHaveCount(0);

	// More than one at a time is a normal Tuesday, not a conflict. m1-spec §6.
	await ben.page.getByTestId("claim-host").click();
	await expect(ben.page.getByTestId("host-badge-Ben")).toBeVisible();
	await expect(ana.page.getByTestId("host-badge-Ben")).toBeVisible();
	await expect(ana.page.getByTestId("host-badge-Ana")).toBeVisible();
	await expect(ben.page.getByTestId("create-team")).toBeVisible();

	// Stepping down leaves the game running, with the other host still on.
	await ana.page.getByTestId("release-host").click();
	await expect(ben.page.getByTestId("host-badge-Ana")).toHaveCount(0);
	await expect(ana.page.getByTestId("no-host-banner")).toHaveCount(0);

	// Nobody is host, which is fine and self-healing.
	await ben.page.getByTestId("release-host").click();
	await expect(ana.page.getByTestId("no-host-banner")).toBeVisible();
	await expect(ben.page.getByTestId("no-host-banner")).toBeVisible();

	await ana.page.getByTestId("claim-host-banner").click();
	await expect(ben.page.getByTestId("host-badge-Ana")).toBeVisible();
	await expect(ben.page.getByTestId("no-host-banner")).toHaveCount(0);

	await ana.close();
	await ben.close();
});

test("5. removal refuses a rejoin until a host lets them back in", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await ana.page.getByTestId("remove-Ben").click();
	await expect(ana.page.getByTestId("removed-Ben")).toBeVisible();

	/**
	 * Same device, same code. A kick a phone can undo by tapping join one second
	 * later is a button that lies. m1-spec §7.
	 */
	await ben.page.goto("/");
	expect(await joinRefused(ben, code)).toContain("removed");

	await ana.page.getByTestId("readmit-Ben").click();
	await expect(ana.page.getByTestId("removed-Ben")).toHaveCount(0);

	await joinGame(ben, code);
	await waitForSync(ben);
	await expect(ben.page.getByTestId("player-Ana")).toBeVisible();

	await ana.close();
	await ben.close();
});

test("6. leaving voluntarily is frictionless to undo", async ({ browser }) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await createTeam(ana, "Foxes");
	await joinTeam(ben, "Foxes");
	const benId = await playerIdForName(code, "Ben");
	// Polled, not read once: `joinTeam` waits on this phone's own optimistic
	// view, which is by design ahead of the row it will produce.
	await expect.poll(() => teamMembershipCount(benId)).toBe(1);

	await ben.page.getByTestId("leave-game").click();
	await expect(ben.page.getByTestId("create-game")).toBeVisible();
	await expect(
		ana.page.getByTestId("members-Foxes").getByTestId("player-Ben"),
	).toHaveCount(0);

	// People close apps by accident, walk into tunnels and hand phones to
	// friends. Coming back is free, and it is the same player.
	await joinGame(ben, code);
	await waitForSync(ben);
	expect(await playerIdForName(code, "Ben")).toBe(benId);
	await expect.poll(() => teamMembershipCount(benId)).toBe(0);
	await expect(ben.page.getByTestId("unassigned")).toContainText("Ben");

	await ana.close();
	await ben.close();
});

test("7. a lobby of five phones shows five phones", async ({ browser }) => {
	const names = ["Ana", "Ben", "Cara", "Dev", "Eli"];
	const phones: Phone[] = [];
	for (const name of names) phones.push(await openPhone(browser, name));
	const [ana, ben, cara, dev] = phones as [Phone, Phone, Phone, Phone];

	const code = await createGame(ana);
	for (const phone of phones.slice(1)) await joinGame(phone, code);
	for (const phone of phones) await waitForSync(phone);

	await createTeam(ana, "Foxes");
	await createTeam(ana, "Owls");
	await joinTeam(ana, "Foxes");
	await joinTeam(ben, "Foxes");
	await joinTeam(cara, "Owls");
	await joinTeam(dev, "Owls");
	// Eli stays on no team at all, which used to mean seeing nobody.

	/**
	 * Asserted on the socket frames, the way m0-spec test 6 is. Everyone in a
	 * game can always see everyone else; what is secret is where they are.
	 * m1-spec §9.
	 */
	for (const phone of phones) {
		await expect.poll(() => sawPresence(phone), { timeout: 20_000 }).toBe(true);
		for (const name of names) {
			await expect
				.poll(() => presenceOf(phone, name).length, { timeout: 20_000 })
				.toBeGreaterThan(0);
		}
	}

	for (const phone of phones) await phone.close();
});

test("8. in a running round a seeker gets every name and no outside position", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});
	const cara = await openPhone(browser, "Cara", {
		geolocation: { longitude: 13.4, latitude: 52.51 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);

	await createTeam(ana, "Hiders");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");
	await joinTeam(cara, "Hiders");

	for (const phone of [ana, ben, cara]) await openDebug(phone, code);
	await ana.page
		.getByTestId("hider-team")
		.selectOption({ label: "Hiders hides" });
	await ana.page.getByTestId("create-round").click();
	await expect(ana.page.getByTestId("my-role")).toHaveText("seeker");
	await expect(ben.page.getByTestId("my-role")).toHaveText("hider");

	for (const phone of [ana, ben, cara]) {
		await phone.page.getByTestId("sample-position").click();
	}
	await expect(ana.page.getByTestId("presence-Ana")).toContainText("seeker", {
		timeout: 20_000,
	});

	// The seeker sees who is playing…
	await expect
		.poll(() => presenceOf(ana, "Ben").length, { timeout: 20_000 })
		.toBeGreaterThan(0);
	// …and not where any of them are.
	expect(presenceOf(ana, "Ben").filter((e) => e.fix !== null)).toHaveLength(0);
	expect(presenceOf(ana, "Cara").filter((e) => e.fix !== null)).toHaveLength(0);

	// A hider sees every position in the game, including the seeker team's.
	await expect
		.poll(() => presenceOf(ben, "Ana").filter((e) => e.fix !== null).length, {
			timeout: 20_000,
		})
		.toBeGreaterThan(0);

	await ana.close();
	await ben.close();
	await cara.close();
});

test("9. a join link shared from a non-host phone works", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ben);

	// Ben is not the host, and the person nearest the newcomer rarely is.
	// m1-spec §8.
	await expect(ben.page.getByTestId("host-badge-Ben")).toHaveCount(0);
	await ben.page.getByTestId("show-qr").click();
	await expect(ben.page.getByTestId("join-qr")).toBeVisible();

	await cara.page.goto(`/j/${code}`);
	await cara.page.getByTestId("display-name").fill("Cara");
	await cara.page.getByTestId("join-game").click();
	await expect(cara.page.getByTestId("game-code")).toHaveText(code);
	await waitForSync(cara);

	await expect(ana.page.getByTestId("player-Cara")).toBeVisible();

	await ana.close();
	await ben.close();
	await cara.close();
});
