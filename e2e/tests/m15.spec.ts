import { expect, test } from "@playwright/test";
import { agePing, closeDb, trackingRevokedAt } from "./db";
import {
	createGame,
	IPHONE_AGENT,
	openMap,
	openPhone,
	type Phone,
	waitForSync,
} from "./harness";

/**
 * Background tracking, from the map to the first ping. m15-spec §6.
 *
 * The thing under test is a **flow**: three screens with an order, plus a
 * fourth that a player who has already done this lands on instead. Most of
 * what can go wrong here is not a rendering question but a navigation one —
 * which screen a reload lands on, which screen a returning player lands on,
 * and whether the one screen that answers "did it work" can be made to answer
 * wrongly.
 *
 * Every case reads the address off the screen and, where it pings, pings
 * exactly that. Asserting a URL the test built itself would prove the test can
 * build a URL.
 */

test.afterAll(async () => {
	await closeDb();
});

/** The token, taken from the address the screen is offering. */
async function tokenOnScreen(phone: Phone, appId: string): Promise<string> {
	const address = await phone.page
		.getByTestId(`tracking-url-${appId}`)
		.innerText();
	const token = address.match(/\/api\/track\/([^?\s]+)/)?.[1];
	if (!token) throw new Error(`no token in ${address}`);
	return token;
}

/** Pick an app on step one and land on its address. */
async function pickApp(phone: Phone, appId: string): Promise<void> {
	await phone.page.getByTestId(`tracking-pick-${appId}`).click();
	await expect(phone.page.getByTestId(`tracking-url-${appId}`)).toBeVisible();
}

/**
 * 1 — The locate control leads here, and the flow starts by asking which app.
 *
 * m15-spec acceptance 18 owns the sheet itself; what this covers is the handoff
 * at its foot, which is the only way into the flow that a player will ever find
 * on their own.
 */
test("the map's locate control opens the flow, at step one", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await openMap(ana, code);

	await ana.page.getByTestId("cycle-camera").click();
	await expect(ana.page.getByTestId("position-sheet")).toBeVisible();
	await ana.page.getByTestId("position-tracking").click();

	await expect(ana.page.getByTestId("tracking-app-step")).toBeVisible();
	await expect(ana.page).toHaveURL(new RegExp(`/g/${code}/tracking/app$`));
	// Optional, and it says who it is for before it says anything else.
	await expect(ana.page.getByTestId("tracking-app-step")).toContainText(
		"if you are seeking",
	);

	await ana.close();
});

/**
 * 2 — Each app gets its own address, and never the bare endpoint by mistake.
 *
 * m15-spec acceptance 17. This is the failure the screen exists to prevent:
 * OsmAnd and GPSLogger both accept a URL with the wrong placeholders, upload
 * something unreadable, and leave the player looking at an empty map with
 * nothing on screen that is wrong.
 */
test("every app is handed the address its own settings screen needs", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await ana.page.goto(`/g/${code}/tracking`);

	await pickApp(ana, "osmand");
	await expect(ana.page.getByTestId("tracking-url-osmand")).toContainText(
		"lat={0}",
	);

	// Positional against named: not interchangeable, and each is silent about
	// being handed the other.
	await ana.page.goBack();
	await pickApp(ana, "gpslogger");
	await expect(ana.page.getByTestId("tracking-url-gpslogger")).toContainText(
		"lat=%LAT",
	);

	// The two that post JSON take the endpoint alone — a query string here
	// would be noise they ignore.
	await ana.page.goBack();
	await pickApp(ana, "owntracks");
	await expect(
		ana.page.getByTestId("tracking-url-owntracks"),
	).not.toContainText("lat=");

	// One token for the device, whichever app is being set up. m15-spec §3.
	expect(await tokenOnScreen(ana, "owntracks")).toHaveLength(32);

	await ana.close();
});

/**
 * 3 — The screen that says whether it worked, says so on its own.
 *
 * m15-spec acceptance 15. Every part of the actual configuration happens in
 * another app, so this is the only confirmation a player ever gets — and it
 * has to arrive without them touching anything, because their hands are in
 * the other app.
 */
test("the waiting screen resolves itself when a ping arrives", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await ana.page.goto(`/g/${code}/tracking`);

	await pickApp(ana, "owntracks");
	const address = await ana.page
		.getByTestId("tracking-url-owntracks")
		.innerText();

	await ana.page.getByTestId("tracking-pasted").click();
	await expect(ana.page.getByTestId("tracking-status")).toHaveText(
		"Waiting for the first ping",
	);

	// Exactly the address the screen offered, pinged the way OsmAnd's family
	// does — nothing is typed into this app, and nothing is clicked after.
	const ping = await ana.page.request.get(
		`${address.trim()}?lat=52.5219&lon=13.4132`,
	);
	expect(ping.status()).toBe(200);

	await expect(ana.page.getByTestId("tracking-status")).toHaveText(
		"It's working",
	);
	await expect(ana.page.getByTestId("tracking-age")).toContainText("s ago");

	await ana.close();
});

/**
 * 4 — A ping from two hours ago is not an answer about now.
 *
 * m15-spec acceptance 25. A device carries its token between games, so this
 * screen is regularly opened by a phone that *has* been heard from — once,
 * last week. Greeting that with "it's working" would be a claim about the
 * present assembled out of the past.
 */
test("a stale ping does not resolve the waiting screen", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await ana.page.goto(`/g/${code}/tracking`);

	await pickApp(ana, "owntracks");
	const token = await tokenOnScreen(ana, "owntracks");
	await ana.page.getByTestId("tracking-pasted").click();

	await agePing(token, 2 * 60 * 60_000);

	// The poll is four seconds; give it several, and expect it to have changed
	// nothing at all.
	await ana.page.waitForTimeout(9_000);
	await expect(ana.page.getByTestId("tracking-status")).toHaveText(
		"Waiting for the first ping",
	);

	await ana.close();
});

/**
 * 5 — A reload stays where it was, and a return visit skips the flow.
 *
 * m15-spec acceptance 24. The first half is a regression guard: the waiting
 * screen redirects when there is no token, and `loading` is not the same
 * answer as "there is none" — reading it as one bounced anybody who reloaded
 * back to step one while their token was still in flight.
 */
test("a reload holds its screen, and a second visit lands on the status", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await ana.page.goto(`/g/${code}/tracking`);

	await pickApp(ana, "osmand");
	await ana.page.getByTestId("tracking-pasted").click();
	await expect(ana.page.getByTestId("tracking-waiting-step")).toBeVisible();

	await ana.page.reload();
	await expect(ana.page.getByTestId("tracking-waiting-step")).toBeVisible();
	await expect(ana.page).toHaveURL(new RegExp(`/g/${code}/tracking/waiting$`));

	// Coming back later lands on the standing answer, naming the app this phone
	// chose — asking "which app do you use?" of somebody who answered it at
	// lunchtime is the whole reason this screen exists.
	await ana.page.goto(`/g/${code}/tracking`);
	await expect(ana.page.getByTestId("tracking-status-screen")).toBeVisible();
	await expect(ana.page.getByTestId("tracking-url-osmand")).toBeVisible();
	await expect(ana.page.getByTestId("tracking-status")).toHaveText("Waiting");

	await ana.close();
});

/**
 * 6 — Turning it off, from behind the menu.
 *
 * m15-spec acceptance 16 is the server half — the next ping gets a 410. This
 * is the half on the phone: the row is revoked, and the flow forgets it had a
 * token without forgetting which app this phone uses.
 */
test("turning it off revokes the token and empties the flow", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await ana.page.goto(`/g/${code}/tracking`);

	await pickApp(ana, "owntracks");
	const token = await tokenOnScreen(ana, "owntracks");
	expect(await trackingRevokedAt(token)).toBeNull();

	await ana.page.goto(`/g/${code}/tracking`);
	await ana.page.getByTestId("tracking-menu").click();
	await expect(ana.page.getByTestId("tracking-menu-sheet")).toBeVisible();
	await ana.page.getByTestId("tracking-disable").click();

	await expect(ana.page).toHaveURL(new RegExp(`/g/${code}/map$`));
	await expect.poll(async () => trackingRevokedAt(token)).not.toBeNull();

	// With nothing issued, the front door is step one again.
	await ana.page.goto(`/g/${code}/tracking`);
	await expect(ana.page.getByTestId("tracking-app-step")).toBeVisible();

	await ana.close();
});

/**
 * 7 — An iPhone is not sent to install an app that cannot do the job.
 *
 * m15-spec acceptance 22 and 23. OsmAnd's online tracking setting does not
 * exist on iOS and GPSLogger has no iOS build at all, so offering either is
 * offering a dead end — and GPSLogger's install link proves the other half:
 * a store cannot be inferred from a platform.
 */
test("the catalogue is cut to the phone holding it", async ({ browser }) => {
	const iphone = await openPhone(browser, "Ana", { userAgent: IPHONE_AGENT });
	const code = await createGame(iphone);
	await waitForSync(iphone);
	await iphone.page.goto(`/g/${code}/tracking`);

	await expect(
		iphone.page.getByTestId("tracking-pick-owntracks"),
	).toBeVisible();
	await expect(iphone.page.getByTestId("tracking-pick-overland")).toBeVisible();
	await expect(iphone.page.getByTestId("tracking-pick-osmand")).toHaveCount(0);
	await expect(iphone.page.getByTestId("tracking-pick-gpslogger")).toHaveCount(
		0,
	);
	await expect(iphone.page.getByTestId("tracking-pick-traccar")).toBeVisible();

	await iphone.close();

	// A desktop cannot tell which phone is in the player's hand, and a list with
	// two spare entries is a far smaller failure than an empty screen.
	const desktop = await openPhone(browser, "Bo");
	const other = await createGame(desktop);
	await waitForSync(desktop);
	await desktop.page.goto(`/g/${other}/tracking`);

	for (const app of [
		"owntracks",
		"overland",
		"osmand",
		"gpslogger",
		"traccar",
	]) {
		await expect(
			desktop.page.getByTestId(`tracking-pick-${app}`),
		).toBeVisible();
	}

	// Its own link, because GPSLogger is not on the Play Store.
	await pickApp(desktop, "gpslogger");
	await expect(desktop.page.getByTestId("tracking-install")).toHaveAttribute(
		"href",
		/f-droid\.org/,
	);

	await desktop.close();
});
