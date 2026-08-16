import { expect, test } from "@playwright/test";
import {
	answerCount,
	closeDb,
	eventSeqs,
	gameIdForCode,
	positionCapturedAts,
	serverSearchAreaHash,
} from "./db";
import {
	createGame,
	createTeam,
	joinGame,
	joinTeam,
	openPhone,
	type Phone,
	waitForSync,
} from "./harness";

/**
 * The M0 acceptance suite. m0-spec §12.
 *
 * Every "Reviewable when" in the build plan becomes a spec, and a milestone is
 * done when its spec passes. These seven are M0's.
 */

test.afterAll(async () => {
	await closeDb();
});

async function onlyQuestionId(phone: Phone): Promise<string> {
	const id = await phone.page
		.locator("[data-question-id]")
		.first()
		.getAttribute("data-question-id");
	if (!id) throw new Error("no question on screen");
	return id;
}

/** Two teams, the host seeking and everyone else hiding. */
async function setUpRound(host: Phone, others: Phone[]): Promise<void> {
	await createTeam(host, "Hiders");
	await createTeam(host, "Seekers");
	await joinTeam(host, "Seekers");
	for (const phone of others) {
		await expect(phone.page.getByTestId("team-Hiders")).toBeVisible();
		await joinTeam(phone, "Hiders");
	}
	await host.page
		.getByTestId("hider-team")
		.selectOption({ label: "Hiders hides" });
	await host.page.getByTestId("create-round").click();
	await expect(host.page.getByTestId("my-role")).toHaveText("seeker");
	for (const phone of others) {
		await expect(phone.page.getByTestId("my-role")).toHaveText("hider");
	}
}

test("1. two phones join one game by code and each sees the other", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);

	await waitForSync(ana);
	await waitForSync(ben);

	await expect(ana.page.getByTestId("player-Ben")).toBeVisible();
	await expect(ben.page.getByTestId("player-Ana")).toBeVisible();

	await ana.close();
	await ben.close();
});

test("2. a force-quit phone rejoins and converges with no host action", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await createTeam(ana, "Hiders");
	await expect(ben.page.getByTestId("team-Hiders")).toBeVisible();

	// Force-quit: same device, same storage, new process.
	const storage = await ben.context.storageState();
	await ben.close();

	const revived = await browser.newContext({
		storageState: storage,
		permissions: ["geolocation"],
		geolocation: { longitude: 13.4132, latitude: 52.5219 },
	});
	const revivedPage = await revived.newPage();
	// The shell is loaded before the network is cut. A genuine cold start while
	// offline needs the service worker's precache, which the dev server does not
	// install; what this test is about is convergence after being away, so the
	// relaunch happens first and the tunnel second.
	await revivedPage.goto("/game");
	await expect(revivedPage.getByTestId("connection-state")).toHaveText(
		"connected",
		{ timeout: 45_000 },
	);
	await revived.setOffline(true);

	// A change made while it was away.
	await createTeam(ana, "Seekers");
	await expect(revivedPage.getByTestId("team-Seekers")).toHaveCount(0);

	await revived.setOffline(false);
	await expect(revivedPage.getByTestId("connection-state")).toHaveText(
		"connected",
		{ timeout: 45_000 },
	);
	await expect(revivedPage.getByTestId("team-Seekers")).toBeVisible();
	await expect(revivedPage.getByTestId("player-Ben")).toBeVisible();

	await revived.close();
	await ana.close();
});

test("3. an offline answer that loses the race gets exactly one discard notice", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);

	await setUpRound(ana, [ben, cara]);
	await ana.page.getByTestId("ask-radar-1000").click();

	const question = ben.page.getByTestId("question-list").getByRole("listitem");
	await expect(question).toHaveCount(1);
	await expect(
		cara.page.getByTestId("question-list").getByRole("listitem"),
	).toHaveCount(1);

	/**
	 * Ben goes into a tunnel.
	 *
	 * The sync socket is severed, which puts Zero in `connecting` — where m0-spec
	 * §3 says writes queue rather than fail. See `Tunnel` in harness.ts for why
	 * `context.setOffline` is not enough on its own.
	 */
	ben.tunnel.enter();
	await expect(ben.page.getByTestId("connection-state")).toHaveText(
		"connecting",
		{ timeout: 30_000 },
	);

	await ben.page.getByTestId("question-list").getByText("No").click();
	await expect(
		ben.page.getByTestId("question-list").getByText("no"),
	).toBeVisible();

	// Cara, above ground, answers first as far as the server is concerned.
	await cara.page.getByTestId("question-list").getByText("Yes").click();
	await expect(
		cara.page.getByTestId("question-list").getByText("yes"),
	).toBeVisible();

	// Ben surfaces. The queued answer is pushed, and loses.
	ben.tunnel.leave();
	await expect(ben.page.getByTestId("connection-state")).toHaveText(
		"connected",
		{ timeout: 45_000 },
	);

	await expect(ben.page.getByTestId("discard-notice")).toBeVisible({
		timeout: 45_000,
	});
	await expect(ben.page.getByTestId("discard-notice")).toContainText("Cara");

	const gameId = await gameIdForCode(code);
	expect(await answerCount(await onlyQuestionId(ben))).toBe(1);

	// A discard is not an event: nothing about it reaches the log.
	const seqs = await eventSeqs(gameId);
	expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
	expect(new Set(seqs).size).toBe(seqs.length);

	await ana.close();
	await ben.close();
	await cara.close();
});

test("4. re-submitting your own answer is a silent success", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await setUpRound(ana, [ben]);
	await ana.page.getByTestId("ask-radar-1000").click();
	await ben.page.getByTestId("question-list").getByText("Yes").click();
	await expect(
		ben.page.getByTestId("question-list").getByText("yes"),
	).toBeVisible();

	await ben.page.getByRole("button", { name: "Re-submit" }).click();

	// Not a discard notice, and not a second row.
	await expect(ben.page.getByTestId("discard-notice")).toHaveCount(0);
	expect(await answerCount(await onlyQuestionId(ben))).toBe(1);

	await ana.close();
	await ben.close();
});

test("5. the folded search area is byte-identical on client and server", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);

	await setUpRound(ana, [ben]);
	await ana.page.getByTestId("ask-radar-3000").click();
	await ben.page.getByTestId("question-list").getByText("Yes").click();

	await expect(
		ana.page.getByTestId("constraint-list").getByRole("listitem"),
	).toHaveCount(1, { timeout: 30_000 });

	const clientHash = await ana.page
		.getByTestId("search-area-hash")
		.textContent();
	const gameId = await gameIdForCode(code);
	const serverHash = await serverSearchAreaHash(gameId);

	expect(clientHash).toBe(serverHash);

	await ana.close();
	await ben.close();
});

test("6. a seeker is never sent hider coordinates on the ephemeral channel", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		// Somewhere distinctive, so a leak would be unmistakable.
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);
	await setUpRound(ana, [ben]);

	// Give the fan-out several cycles with both phones reporting position.
	await ana.page.getByTestId("sample-position").click();
	await ben.page.getByTestId("sample-position").click();
	// Long enough for the server to re-read roles, so the filter under test is
	// the one that knows Ana is a seeker rather than the one that knows nothing.
	await expect(ana.page.getByTestId("presence-Ana")).toContainText("seeker", {
		timeout: 20_000,
	});

	/**
	 * Asserted on the socket frames rather than on the UI. Not because a friend
	 * would open dev tools, but because this is the only test that fails loudly
	 * when someone widens a fan-out filter by accident three milestones from now.
	 */
	const leaked = ana.frames
		.filter((frame) => frame.includes('"presence"'))
		.flatMap((frame) => {
			const parsed: unknown = JSON.parse(frame);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("entries" in parsed)
			) {
				return [];
			}
			const entries = (parsed as { entries: { displayName: string }[] })
				.entries;
			return entries.filter((entry) => entry.displayName === "Ben");
		});

	expect(leaked).toHaveLength(0);
	expect(ana.frames.some((frame) => frame.includes('"presence"'))).toBe(true);

	await ana.close();
	await ben.close();
});

test("7. an offline stretch flushes a complete track with real capture times", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");

	const code = await createGame(ana);
	await joinGame(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);
	await setUpRound(ana, [ben]);

	const gameId = await gameIdForCode(code);
	const before = (await positionCapturedAts(gameId)).length;

	/**
	 * The tunnel. The spec's ten minutes are simulated with an offline context
	 * and distinct positions rather than a fake clock, because `page.clock` fakes
	 * the page's `Date.now()` but not the timestamp the browser stamps on a
	 * geolocation fix — which is precisely the value under test.
	 */
	await ben.context.setOffline(true);

	const track = [
		{ longitude: 13.4132, latitude: 52.5219 },
		{ longitude: 13.4232, latitude: 52.5239 },
		{ longitude: 13.4332, latitude: 52.5259 },
		{ longitude: 13.4432, latitude: 52.5279 },
		{ longitude: 13.4532, latitude: 52.5299 },
	];
	for (const position of track) {
		await ben.context.setGeolocation(position);
		await ben.page.getByTestId("sample-position").click();
		await ben.page.waitForTimeout(400);
	}

	await expect(ben.page.getByTestId("position-queue-size")).toHaveText(
		`queued: ${track.length}`,
	);

	const surfacedAt = Date.now();
	await ben.context.setOffline(false);

	await expect(ben.page.getByTestId("position-queue-size")).toHaveText(
		"queued: 0",
		{ timeout: 45_000 },
	);

	const captured = await positionCapturedAts(gameId);
	expect(captured.length).toBe(before + track.length);

	const flushed = captured.slice(before);
	// Ordered by the sender's own clock…
	expect(flushed).toEqual([...flushed].sort((a, b) => a - b));
	// …and every one of them says it happened underground, not on reconnect.
	for (const capturedAt of flushed) {
		expect(capturedAt).toBeLessThan(surfacedAt);
	}

	await ana.close();
	await ben.close();
});
