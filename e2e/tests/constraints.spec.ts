import { expect, test } from "@playwright/test";
import { closeDb, teamIdForName } from "./db";
import {
	createGame,
	joinGame,
	joinTeam,
	openLobby,
	openMap,
	openPhone,
	type Phone,
	startHiding,
	startSeekingPhase,
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

async function commitZone(hider: Phone, code: string): Promise<void> {
	await openMap(hider, code);
	await waitForSync(hider);
	await expect(hider.page.getByTestId("hiding-sheet")).toBeVisible();
	await hider.page.getByTestId("commit-zone").click();
	await expect(hider.page.getByTestId("uncommit-zone")).toBeVisible();
}

async function startSeeking(host: Phone, code: string): Promise<void> {
	await openLobby(host, code);
	await startSeekingPhase(host);
	await expect(
		host.page
			.getByTestId("lobby-round-phase")
			.or(host.page.getByTestId("round-phase"))
			.first(),
	).toContainText("seeking", { timeout: 20_000 });
}

/**
 * Narrowing down opens the cuts list; the picker is one button inside it. Both
 * steps are one flow for a test, so this walks the whole way to a shape.
 */
async function pickConstraint(
	phone: Phone,
	testId:
		| "add-radius-constraint"
		| "add-polygon-constraint"
		| "add-bezirk-constraint"
		| "add-split-constraint",
): Promise<void> {
	await openCutsList(phone);
	await phone.page.getByTestId("add-constraint").click();
	await expect(phone.page.getByTestId("constraints-picker")).toBeVisible();
	await phone.page.getByTestId(testId).click();
}

async function openCutsList(phone: Phone): Promise<void> {
	await phone.page.getByTestId("map-ask").click();
	await expect(phone.page.getByTestId("seeker-actions")).toBeVisible();
	await phone.page.getByTestId("narrow-it-down").click();
	await expect(phone.page.getByTestId("constraint-list-sheet")).toBeVisible();
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
	await joinTeam(ana, "Seekers");
	await joinTeam(cara, "Seekers");
	await joinTeam(ben, "Hiders");

	await startHiding([ana, ben, cara], code, "30");
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

	await pickConstraint(ana, "add-radius-constraint");
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

	await openCutsList(ana);
	// The name is a field inside the opened row, not on the line itself.
	await ana.page.locator('[data-testid^="constraint-open-"]').click();
	await expect(
		ana.page.locator('[data-testid^="constraint-name-"]'),
	).toHaveValue("north park");
	await ana.page.locator('[data-testid^="toggle-constraint-"]').click();
	await expect(ana.page.getByTestId("surviving-area-hash")).toHaveText(seed, {
		timeout: 20_000,
	});
	await expect(cara.page.getByTestId("surviving-area-hash")).toHaveText(seed);
});

test("a seeker radius can be placed by typing coordinates", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");

	await startHiding([ana, ben], code, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await waitForSync(ana);

	const seed = await areaHash(ana);
	await pickConstraint(ana, "add-radius-constraint");
	await expect(ana.page.getByTestId("radius-draft")).toBeVisible();
	await ana.page.getByTestId("radius-center-point").click();
	await ana.page.getByTestId("radius-center-input").fill("52.52000, 13.40500");
	await ana.page.keyboard.press("Escape");
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});
	expect(await areaHash(ana)).not.toBe(seed);
});

test("two hider teams switch folds from the selector", async ({ browser }) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");
	const code = await createGame(ana, [
		{ name: "Hiders", side: "hider" },
		{ name: "Foxes", side: "hider" },
		{ name: "Seekers", side: "seeker" },
	]);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");
	await joinTeam(cara, "Foxes");

	await startHiding([ana, ben, cara], code, "30");
	await commitZone(ben, code);
	await commitZone(cara, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await waitForSync(ana);
	await expect(ana.page.getByTestId("hider-selector")).toBeVisible();

	const hidersId = await teamIdForName(code, "Hiders");
	const foxesId = await teamIdForName(code, "Foxes");
	const seed = await areaHash(ana);

	await pickConstraint(ana, "add-radius-constraint");
	await tapMap(ana, 0.5, 0.2);
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});
	const cut = await areaHash(ana);
	expect(cut).not.toBe(seed);

	await ana.page.getByTestId("hider-selector").click();
	await ana.page.getByTestId(`hider-selector-${foxesId}`).click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("0");
	await expect(ana.page.getByTestId("surviving-area-hash")).toHaveText(seed);

	await ana.page.getByTestId("hider-selector").click();
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
	await joinTeam(ana, "Seekers");
	await joinTeam(cara, "Seekers");
	await joinTeam(ben, "Hiders");

	await startHiding([ana, ben, cara], code, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await openMap(cara, code);
	await openMap(ben, code);
	for (const phone of [ana, cara, ben]) await waitForSync(phone);

	const seed = await areaHash(ana);
	await expect(ben.page.getByTestId("add-bezirk-constraint")).toHaveCount(0);

	await pickConstraint(ana, "add-bezirk-constraint");
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

	await openCutsList(ana);
	await ana.page.locator('[data-testid^="constraint-open-"]').click();
	await expect(
		ana.page.locator('[data-testid^="constraint-name-"]'),
	).toHaveValue("Mitte");
});

test("a seeker split cuts one side of the remaining area", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");

	await startHiding([ana, ben], code, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await waitForSync(ana);

	const seed = await areaHash(ana);
	await pickConstraint(ana, "add-split-constraint");
	await expect(ana.page.getByTestId("split-draft")).toBeVisible();
	await tapMap(ana, 0.35, 0.45);
	await tapMap(ana, 0.65, 0.45);
	await ana.page.getByTestId("constraint-name").fill("thermometer");
	await ana.page.getByTestId("exclude-from-side").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});

	const cut = await areaHash(ana);
	expect(cut).not.toBe(seed);
	await expect(ben.page.getByTestId("surviving-area-hash")).toHaveText(seed);

	await ana.close();
	await ben.close();
});

test("a cut reopens in the tool that drew it, and rewrites that row", async ({
	browser,
}) => {
	test.setTimeout(120_000);
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");

	await startHiding([ana, ben], code, "30");
	await commitZone(ben, code);
	await startSeeking(ana, code);

	await openMap(ana, code);
	await waitForSync(ana);

	await pickConstraint(ana, "add-bezirk-constraint");
	await expect(ana.page.getByTestId("boundary-9-mitte")).toBeVisible({
		timeout: 20_000,
	});
	await ana.page.getByTestId("boundary-9-mitte").click();
	await ana.page.getByTestId("they-are-inside").click();
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});
	const included = await areaHash(ana);

	// A Bezirk is stored as a plain polygon: only the recorded origin can tell
	// the picker from the pencil.
	await openCutsList(ana);
	// Redraw lives in the opened row, alongside Show and Remove.
	await ana.page.locator('[data-testid^="constraint-open-"]').click();
	await ana.page.locator('[data-testid^="edit-constraint-"]').click();
	await expect(ana.page.getByTestId("constraint-editing")).toBeVisible();
	await expect(ana.page.getByTestId("constraint-name")).toHaveValue("Mitte");

	await ana.page.getByTestId("constraint-mode-exclude").click();
	await ana.page.getByTestId("they-are-outside").click();

	// Rewritten, not added: one row, and the fold is the other way round.
	await expect(ana.page.getByTestId("constraint-count")).toHaveText("1", {
		timeout: 20_000,
	});
	expect(await areaHash(ana)).not.toBe(included);
	await openCutsList(ana);
	await ana.page.locator('[data-testid^="constraint-open-"]').click();
	await expect(
		ana.page.locator('[data-testid^="constraint-name-"]'),
	).toHaveValue("Mitte");

	await ana.close();
	await ben.close();
});
