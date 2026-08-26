import { expect, test } from "@playwright/test";
import { closeDb } from "./db";
import { openPhone, type Phone, submitCreateName } from "./harness";

/**
 * The setup wizard's area editor: districts, a cut, back-to-picker, and
 * keeping an uncommitted draft when leaving the editor.
 */

test.afterAll(async () => {
	await closeDb();
});

async function openAreaStep(phone: Phone): Promise<void> {
	await phone.page.getByTestId("create-game").click();
	await submitCreateName(phone);
	await phone.page.getByTestId("setup-area-district").waitFor();
}

test("backing out of a tool returns to Where are you playing", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	await openAreaStep(host);

	await host.page.getByTestId("setup-area-district").click();
	await host.page.getByTestId("area-boundary-tabs").waitFor();
	await host.page.getByTestId("screen-back").click();
	await expect(host.page.getByTestId("setup-area-district")).toBeVisible();
	await expect(host.page.getByTestId("area-editor")).toHaveCount(0);

	await host.close();
});

test("a district folds into the area and hands it back to the wizard", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	await openAreaStep(host);

	await host.page.getByTestId("setup-area-district").click();
	await host.page
		.getByTestId("area-place-search")
		.fill("Friedrichshain-Kreuzberg");
	await host.page.getByTestId("area-district-Friedrichshain-Kreuzberg").click();
	await host.page.getByTestId("area-district-add").click();
	await expect(host.page.getByTestId("area-editor")).toBeVisible();

	await host.page.getByTestId("area-tool-cut").click();
	await host.page.getByTestId("area-tool-districts").click();
	await host.page.getByTestId("area-place-search").fill("Tempelhof-Schöneberg");
	await host.page.getByTestId("area-district-Tempelhof-Schöneberg").click();
	await host.page.getByTestId("area-district-add").click();

	await host.page.getByTestId("area-use").click();
	await expect(host.page.getByTestId("setup-area-chosen")).toContainText(
		"Friedrichshain-Kreuzberg",
		{ timeout: 20_000 },
	);
	await expect(host.page.getByTestId("setup-area-district")).toHaveCount(0);

	await host.page.getByTestId("setup-area-chosen").click();
	await expect(host.page.getByTestId("area-editor")).toBeVisible();
	await host.page.getByTestId("screen-back").click();
	await expect(host.page.getByTestId("setup-area-chosen")).toBeVisible();

	await host.page.getByTestId("setup-area-continue").click();
	await expect(host.page.getByTestId("setup-stops-in-play")).toBeVisible();

	await host.close();
});

test("backing out of the editor keeps uncommitted pieces", async ({
	browser,
}) => {
	const host = await openPhone(browser, "Host");
	await openAreaStep(host);

	await host.page.getByTestId("setup-area-district").click();
	await host.page
		.getByTestId("area-place-search")
		.fill("Friedrichshain-Kreuzberg");
	await host.page.getByTestId("area-district-Friedrichshain-Kreuzberg").click();
	await host.page.getByTestId("area-district-add").click();
	await expect(host.page.getByTestId("area-editor")).toBeVisible();

	await host.page.getByTestId("screen-back").click();
	await expect(host.page.getByTestId("setup-area-chosen")).toBeVisible();
	await expect(host.page.getByTestId("setup-area-district")).toHaveCount(0);

	await host.close();
});
