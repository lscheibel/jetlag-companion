import { expect, test } from "@playwright/test";
import { closeDb } from "./db";
import {
	chooseBerlinArea,
	createGame,
	joinGame,
	openPhone,
	type Phone,
	submitCreateName,
	waitForSync,
} from "./harness";

/**
 * Team structure belongs in the create-game wizard, not only in the lobby.
 * People still join teams on the board; this screen is names, sides and faces.
 */

test.afterAll(async () => {
	await closeDb();
});

async function openTeamsStep(phone: Phone) {
	await phone.page.getByTestId("create-game").click();
	await submitCreateName(phone);
	await chooseBerlinArea(phone);
	await phone.page.getByTestId("setup-area-continue").click();
	await phone.page.getByTestId("setup-transit-continue").click();
	await phone.page.getByTestId("setup-size-continue").click();
	await expect(phone.page.getByTestId("setup-teams")).toBeVisible();
	await waitForSync(phone);
}

test("the wizard can add, rename and remove a team", async ({ browser }) => {
	const host = await openPhone(browser, "Host");
	await openTeamsStep(host);
	await expect(host.page.getByTestId("setup-teams-continue")).toBeDisabled();

	await host.page.getByTestId("create-team").click();
	await expect(host.page.getByTestId("side-hider")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await host.page.getByTestId("team-name-input").fill("Foxes");
	await host.page.getByTestId("team-editor-done").click();
	await expect(host.page.getByTestId("team-Foxes")).toBeVisible();

	await host.page.getByTestId("team-Foxes").click();
	await host.page.getByTestId("team-name-input").fill("Vixens");
	await host.page.getByTestId("team-editor-done").click();
	await expect(host.page.getByTestId("team-Vixens")).toBeVisible();
	await expect(host.page.getByTestId("team-Foxes")).toHaveCount(0);

	await host.page.getByTestId("team-Vixens").click();
	await host.page.getByTestId("delete-Vixens").click();
	await expect(host.page.getByTestId("team-Vixens")).toHaveCount(0);

	await expect(host.page.getByTestId("setup-teams-continue")).toBeDisabled();

	await host.close();
});

test("review lists the teams, and the lobby menu opens the step", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	await openTeamsStep(host);

	await host.page.getByTestId("create-team").click();
	await host.page.getByTestId("team-name-input").fill("Owls");
	await host.page.getByTestId("side-seeker").click();
	await host.page.getByTestId("team-editor-done").click();
	await expect(host.page.getByTestId("team-Owls")).toBeVisible();

	await expect(host.page.getByTestId("setup-teams-continue")).toBeDisabled();

	await host.page.getByTestId("create-team").click();
	await expect(host.page.getByTestId("side-hider")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await host.page.getByTestId("team-name-input").fill("Foxes");
	await host.page.getByTestId("side-hider").click();
	await host.page.getByTestId("team-editor-done").click();
	await expect(host.page.getByTestId("team-Foxes")).toBeVisible();

	await host.page.getByTestId("setup-teams-continue").click();
	await expect(host.page.getByTestId("setup-review")).toContainText("Owls");

	await host.page.getByTestId("setup-open-lobby").click();
	await expect(host.page.getByTestId("lobby")).toBeVisible();
	await expect(host.page.getByTestId("team-Owls")).toBeVisible();

	await host.page.getByTestId("lobby-menu").click();
	await host.page.getByTestId("open-teams").click();
	await expect(host.page.getByTestId("setup-teams")).toBeVisible();
	await expect(host.page.getByTestId("stepper")).toHaveCount(0);
	await expect(host.page.getByTestId("team-Owls")).toBeVisible();

	await host.page.getByTestId("setup-teams-continue").click();
	await expect(host.page.getByTestId("lobby")).toBeVisible();

	await host.close();
});

test("a player who is not host does not get the teams menu", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ben);

	await ben.page.getByTestId("lobby-menu").click();
	await expect(ben.page.getByTestId("open-teams")).toHaveCount(0);

	await ana.close();
	await ben.close();
});
