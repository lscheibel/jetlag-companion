import { expect, test } from "@playwright/test";
import { closeDb, teamIdForName } from "./db";
import {
	createGame,
	createTeam,
	joinGame,
	joinTeam,
	openLobby,
	openMap,
	openPhone,
	type Phone,
	waitForSync,
} from "./harness";

/**
 * Seeker constraints and excluded-area shading. First slice of M13: a hand
 * radius/polygon cuts the surviving area, hiders never see those cuts, and two
 * hider teams get two folds.
 */

test.afterAll(async () => {
	await closeDb();
});

async function setSide(
	phone: Phone,
	team: string,
	side: "hider" | "seeker",
): Promise<void> {
	await phone.page.getByTestId(`${side}-${team}`).click();
	await expect(phone.page.getByTestId(`role-${team}`)).toHaveText(side);
}

async function startHiding(host: Phone, minutes: string): Promise<void> {
	await host.page.getByTestId("hiding-duration").fill(minutes);
	await host.page.getByTestId("start-hiding").click();
	await expect(host.page.getByTestId("lobby-round-phase")).toContainText(
		"hiding",
	);
}

async function commitZone(hider: Phone, code: string): Promise<void> {
	await openMap(hider, code);
	await waitForSync(hider);
	await expect(hider.page.getByTestId("hiding-sheet")).toBeVisible();
	await hider.page.getByTestId("commit-zone").click();
	await expect(hider.page.getByTestId("committed-stop")).toBeVisible();
}

async function startSeeking(host: Phone, code: string): Promise<void> {
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();
	await expect(
		host.page
			.getByTestId("lobby-round-phase")
			.or(host.page.getByTestId("round-phase"))
			.first(),
	).toContainText("seeking", { timeout: 20_000 });
}

async function tapMap(phone: Phone, fx: number, fy: number): Promise<void> {
	const canvas = phone.page.getByTestId("map-canvas");
	await expect(canvas).toBeVisible();
	const box = await canvas.boundingBox();
	if (!box) throw new Error("the map canvas has no box to tap in");
	await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
}

async function areaHash(phone: Phone): Promise<string> {
	const text = await phone.page
		.getByTestId("surviving-area-hash")
		.textContent();
	if (!text) throw new Error(`${phone.name} has no surviving-area-hash`);
	return text;
}

test("a seeker radius cuts the overlay for seekers and not for hiders", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");
	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);
	await createTeam(ana, "Hiders");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(cara, "Seekers");
	await joinTeam(ben, "Hiders");
	await setSide(ana, "Hiders", "hider");
	await setSide(ana, "Seekers", "seeker");

	await startHiding(ana, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await openMap(cara, code);
	await openMap(ben, code);
	for (const phone of [ana, cara, ben]) await waitForSync(phone);

	const seed = await areaHash(ana);
	await expect(cara.page.getByTestId("surviving-area-hash")).toHaveText(seed);
	await expect(ben.page.getByTestId("surviving-area-hash")).toHaveText(seed);
	await expect(ben.page.getByTestId("add-radius-constraint")).toHaveCount(0);

	await ana.page.getByTestId("add-radius-constraint").click();
	await tapMap(ana, 0.5, 0.2);
	await ana.page.getByTestId("constraint-name").fill("north park");
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});

	const cut = await areaHash(ana);
	expect(cut).not.toBe(seed);
	await expect(cara.page.getByTestId("surviving-area-hash")).toHaveText(cut);
	await expect(ben.page.getByTestId("surviving-area-hash")).toHaveText(seed);
	await expect(ben.page.getByTestId("constraint-count")).toHaveText("0");

	await ana.page.getByTestId("constraint-list").click();
	await expect(
		ana.page.locator('[data-testid^="constraint-name-"]'),
	).toHaveValue("north park");
	await ana.page.locator('[data-testid^="toggle-constraint-"]').click();
	await expect(ana.page.getByTestId("surviving-area-hash")).toHaveText(seed, {
		timeout: 20_000,
	});
	await expect(cara.page.getByTestId("surviving-area-hash")).toHaveText(seed);
});

test("two hider teams switch folds from the selector", async ({ browser }) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");
	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);
	await createTeam(ana, "Hiders");
	await createTeam(ana, "Foxes");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");
	await joinTeam(cara, "Foxes");
	await setSide(ana, "Hiders", "hider");
	await setSide(ana, "Foxes", "hider");
	await setSide(ana, "Seekers", "seeker");

	await startHiding(ana, "30");
	await commitZone(ben, code);
	await commitZone(cara, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await waitForSync(ana);
	await expect(ana.page.getByTestId("hider-selector")).toBeVisible();

	const hidersId = await teamIdForName(code, "Hiders");
	const foxesId = await teamIdForName(code, "Foxes");
	const seed = await areaHash(ana);

	await ana.page.getByTestId("add-radius-constraint").click();
	await tapMap(ana, 0.5, 0.2);
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});
	const cut = await areaHash(ana);
	expect(cut).not.toBe(seed);

	await ana.page.getByTestId(`hider-selector-${foxesId}`).click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("0");
	await expect(ana.page.getByTestId("surviving-area-hash")).toHaveText(seed);

	await ana.page.getByTestId(`hider-selector-${hidersId}`).click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1");
	await expect(ana.page.getByTestId("surviving-area-hash")).toHaveText(cut);
});

test("a seeker Bezirk include cuts the overlay for seekers and not for hiders", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");
	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);
	await createTeam(ana, "Hiders");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(cara, "Seekers");
	await joinTeam(ben, "Hiders");
	await setSide(ana, "Hiders", "hider");
	await setSide(ana, "Seekers", "seeker");

	await startHiding(ana, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await openMap(cara, code);
	await openMap(ben, code);
	for (const phone of [ana, cara, ben]) await waitForSync(phone);

	const seed = await areaHash(ana);
	await expect(ben.page.getByTestId("add-bezirk-constraint")).toHaveCount(0);

	await ana.page.getByTestId("add-bezirk-constraint").click();
	await expect(ana.page.getByTestId("boundary-9-mitte")).toBeVisible({
		timeout: 20_000,
	});
	await ana.page.getByTestId("boundary-9-mitte").click();
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});

	const cut = await areaHash(ana);
	expect(cut).not.toBe(seed);
	await expect(cara.page.getByTestId("surviving-area-hash")).toHaveText(cut);
	await expect(ben.page.getByTestId("surviving-area-hash")).toHaveText(seed);
	await expect(ben.page.getByTestId("constraint-count")).toHaveText("0");

	await ana.page.getByTestId("constraint-list").click();
	await expect(
		ana.page.locator('[data-testid^="constraint-name-"]'),
	).toHaveValue("Mitte");
});
