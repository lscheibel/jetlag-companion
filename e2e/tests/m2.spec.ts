import { expect, test } from "@playwright/test";
import {
	closeDb,
	eventSeqs,
	gameIdForCode,
	playerIdForName,
	positionCountForTeam,
	positionIdsForTeam,
	teamIdForName,
} from "./db";
import {
	createGame,
	createTeam,
	joinGame,
	joinTeam,
	openDebug,
	openMap,
	openPhone,
	type Phone,
	presenceOf,
	waitForSync,
} from "./harness";

/**
 * The M2 acceptance suite. m2-spec §13.
 *
 * Tests 2 and 11 are the pair that matters most: they are the only two that
 * fail loudly when somebody widens a filter by accident three milestones from
 * now, and they cover the two different places the filter lives — the channel's
 * fan-out and Zero's query resolution.
 *
 * The spec's twelfth test is `m0.spec.ts` and `m1.spec.ts` themselves. They are
 * files rather than cases here, so they are not repeated.
 *
 * **No case here calls OpenFreeMap.** `installTiles` in harness.ts intercepts
 * the host unconditionally, for every phone, and nothing reaches it. The service
 * is free, keyless and uncapped, and a suite that hammers it on every run is
 * putting load on somebody else's generosity for no information. Test 12 asserts
 * what this app *asks* for, at the interceptor.
 */

test.afterAll(async () => {
	await closeDb();
});

/** Two hider teams and n seeker teams, roles assigned, round running. */
async function setUpRound(
	host: Phone,
	code: string,
	teams: { name: string; phones: Phone[]; side: "hider" | "seeker" }[],
): Promise<void> {
	for (const team of teams) {
		if ((await host.page.getByTestId(`team-${team.name}`).count()) === 0) {
			await createTeam(host, team.name, team.side);
		}
	}
	for (const team of teams) {
		for (const phone of team.phones) await joinTeam(phone, team.name);
	}

	const hider = teams.find((team) => team.side === "hider");
	if (!hider) throw new Error("a round needs a hiding team");

	await openDebug(host, code);
	await host.page
		.getByTestId("hider-team")
		.selectOption({ label: `${hider.name} hides` });
	await host.page.getByTestId("create-round").click();
	await expect(host.page.getByTestId("my-role")).toHaveText(/hider|seeker/);
}

/**
 * The rows a phone's own store actually holds, named rather than counted.
 *
 * A count proves nothing leaked. Naming the rows is what proves the right ones
 * arrived, which is the half of the trail rule that widening the query added —
 * and it does not race the sampling interval the way comparing two counts read
 * a moment apart does.
 */
async function syncedPositionIds(phone: Phone): Promise<string[]> {
	const ids = await phone.page
		.getByTestId("position-log-captured")
		.getByRole("listitem")
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("data-testid") ?? ""),
		);
	return ids.map((id) => id.replace(/^position-/, ""));
}

/**
 * Walk somewhere else and log it, so a player has a track rather than a point.
 *
 * The wait is for the position watch to deliver the new place — `sample` logs
 * whatever the watch last handed it, so clicking straight after
 * `setGeolocation` would write the old fix a second time.
 */
async function walkAndSample(
	phone: Phone,
	to: { longitude: number; latitude: number },
): Promise<void> {
	const before =
		(await phone.page.getByTestId("position-last-captured").textContent()) ??
		"";
	await phone.context.setGeolocation(to);
	await expect(phone.page.getByTestId("position-last-captured")).not.toHaveText(
		before,
		{ timeout: 30_000 },
	);
	await phone.page.getByTestId("sample-position").click();
}

test("1. a hider watches three seeker teams move", async ({ browser }) => {
	const ana = await openPhone(browser, "Ana");
	const seekers: Phone[] = [];
	for (const name of ["Ben", "Cara", "Dev"]) {
		seekers.push(
			await openPhone(browser, name, {
				geolocation: { longitude: 13.4, latitude: 52.51 },
			}),
		);
	}
	const [ben, cara, dev] = seekers as [Phone, Phone, Phone];

	const code = await createGame(ana);
	for (const phone of seekers) await joinGame(phone, code);
	for (const phone of [ana, ...seekers]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Alpha", phones: [ben], side: "seeker" },
		{ name: "Bravo", phones: [cara], side: "seeker" },
		{ name: "Charlie", phones: [dev], side: "seeker" },
	]);

	await openMap(ana, code);
	await expect(ana.page.getByTestId("my-role")).toHaveText("hider");
	for (const phone of seekers) await openMap(phone, code);

	// Three markers, each attributed to the right team, on the hider's map.
	for (const phone of seekers) {
		await expect(ana.page.getByTestId(`marker-${phone.name}`)).toBeVisible({
			timeout: 30_000,
		});
	}

	/**
	 * They move. `setGeolocation` walks each seeker to a different place and the
	 * marker follows — which is the whole milestone in one assertion.
	 */
	const walk = [
		{ phone: ben, to: { longitude: 13.38, latitude: 52.52 } },
		{ phone: cara, to: { longitude: 13.44, latitude: 52.5 } },
		{ phone: dev, to: { longitude: 13.42, latitude: 52.54 } },
	];
	/**
	 * One phone at a time, fronted while it walks and while its move propagates.
	 *
	 * Broadcasting follows the screen, and here that is meant literally: a hidden
	 * document gets its `watchPosition` suspended and its timers throttled, so a
	 * seeker walking in a background tab reports nothing. That is the same
	 * browser limit m2-spec §10 admits about the lock screen, not something this
	 * test should paper over — three seekers each looking at their own phone is
	 * what the milestone is about.
	 */
	for (const step of walk) {
		await step.phone.page.bringToFront();
		await step.phone.context.setGeolocation(step.to);
		await expect(step.phone.page.getByTestId("own-marker")).toBeVisible({
			timeout: 30_000,
		});
		await step.phone.page.getByTestId("own-marker").click();
		await expect(step.phone.page.getByTestId("own-readout")).toContainText(
			step.to.longitude.toFixed(2),
			{ timeout: 30_000 },
		);

		await expect
			.poll(
				() => {
					const seen = presenceOf(ana, step.phone.name).filter(
						(entry) => entry.fix !== null,
					);
					const last = seen[seen.length - 1]?.fix;
					return last && typeof last === "object"
						? Reflect.get(last, "lng")
						: null;
				},
				{ timeout: 30_000 },
			)
			.toBeCloseTo(step.to.longitude, 2);
	}

	for (const phone of [ana, ...seekers]) await phone.close();
});

test("2. seeker team A sees seeker team B, and never where they are", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});
	const cara = await openPhone(browser, "Cara", {
		// Somewhere distinctive, so a leak would be unmistakable.
		geolocation: { longitude: 13.5, latitude: 52.45 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Alpha", phones: [ben], side: "seeker" },
		{ name: "Bravo", phones: [cara], side: "seeker" },
	]);

	for (const phone of [ben, cara]) await openMap(phone, code);
	await expect(ben.page.getByTestId("my-role")).toHaveText("seeker", {
		timeout: 30_000,
	});

	/**
	 * The corrected rule, in two halves. Ben knows Cara is in the game, which
	 * team she is on and whether she is online — the build plan used to say he
	 * could not see her "anywhere in the UI", which was wrong. What he never
	 * receives is a coordinate.
	 */
	await expect
		.poll(
			() =>
				presenceOf(ben, "Cara").filter(
					(entry) => entry.teamId !== null && entry.role === "seeker",
				).length,
			{ timeout: 30_000 },
		)
		.toBeGreaterThan(0);
	const caraAsSeenByBen = presenceOf(ben, "Cara");
	expect(caraAsSeenByBen.some((entry) => entry.online === true)).toBe(true);

	// No coordinate in the frames, no age of one, no battery, and no marker.
	expect(caraAsSeenByBen.filter((entry) => entry.fix !== null)).toHaveLength(0);
	expect(
		caraAsSeenByBen.filter((entry) => entry.fixAgeMs !== null),
	).toHaveLength(0);
	expect(
		caraAsSeenByBen.filter((entry) => entry.battery !== null),
	).toHaveLength(0);
	await expect(ben.page.getByTestId("marker-Cara")).toHaveCount(0);

	for (const phone of [ana, ben, cara]) await phone.close();
});

test("3. a phone in a tunnel goes stale rather than disappearing", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Seekers", phones: [ben], side: "seeker" },
	]);

	await openMap(ana, code);
	await openMap(ben, code);
	await expect(ana.page.getByTestId("marker-Ben")).toBeVisible({
		timeout: 30_000,
	});

	/**
	 * First the converse, which is the half that is easy to break by accident:
	 * Ben stands perfectly still for longer than the fresh bucket and stays
	 * fresh. `watchPosition` calls back once for a phone that is not moving, so
	 * without the channel re-offering the fix it is holding, every hider standing
	 * on a platform would have looked stale within two minutes.
	 */
	await ana.page.waitForTimeout(35_000);
	await expect(ana.page.getByTestId("marker-Ben")).toHaveAttribute(
		"data-staleness",
		"fresh",
	);

	// Into the tunnel: the presence socket goes, and only it.
	ben.channelTunnel.enter();

	/**
	 * The regression guard for m2-spec §6. M0 deleted the entry on close, so the
	 * marker vanished — taking the last known position with it and making "last
	 * seen 5 minutes ago" unimplementable.
	 */
	await expect(ana.page.getByTestId("marker-Ben")).toBeVisible({
		timeout: 30_000,
	});
	await expect(ana.page.getByTestId("marker-Ben")).toContainText("offline", {
		timeout: 30_000,
	});
	await expect(ana.page.getByTestId("marker-Ben")).toHaveAttribute(
		"data-staleness",
		/fresh|recent|ageing/,
	);

	for (const phone of [ana, ben]) await phone.close();
});

test("4. a reader whose clock is ten minutes fast still reads staleness right", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Seekers", phones: [ben], side: "seeker" },
	]);
	await openMap(ben, code);

	/**
	 * Ana's own clock is ten minutes ahead of everyone else's — the state
	 * m0-spec §7 says the system must never notice.
	 *
	 * The old code rendered `Date.now() - entry.fix.capturedAt`, subtracting
	 * Ben's clock from Ana's, and would show a fresh fix as "last seen 600s ago".
	 * The new arithmetic adds two elapsed durations, so the skew cancels.
	 *
	 * Only the reader's clock is skewed here. Skewing the *sender's* would need a
	 * faked `GeolocationPosition.timestamp`, which Playwright does not fake — the
	 * same limitation m0 test 7 records.
	 */
	await ana.page.clock.install({ time: new Date(Date.now() + 600_000) });
	await openMap(ana, code);

	await expect(ana.page.getByTestId("marker-Ben")).toBeVisible({
		timeout: 30_000,
	});
	await expect(ana.page.getByTestId("marker-Ben")).toHaveAttribute(
		"data-staleness",
		"fresh",
		{ timeout: 30_000 },
	);
	await expect(ana.page.getByTestId("marker-age-Ben")).not.toContainText("ago");

	for (const phone of [ana, ben]) await phone.close();
});

test("5. one accuracy ring, and it is your own", async ({ browser }) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Seekers", phones: [ben], side: "seeker" },
	]);
	await openMap(ben, code);

	/**
	 * Own position renders with the socket blocked from the first paint: the
	 * device already knows where it is, and asking the server to tell it back
	 * would add latency and a failure mode for nothing. m2-spec §4.
	 */
	ana.channelTunnel.enter();
	await openMap(ana, code);
	await expect(ana.page.getByTestId("own-marker")).toBeVisible({
		timeout: 30_000,
	});
	await ana.page.getByTestId("own-marker").click();
	await expect(ana.page.getByTestId("own-readout")).toContainText("±");

	/**
	 * Everybody else's accuracy is six characters of text next to their name,
	 * both under the marker and in the sheet — never a circle. m2-spec §5.
	 *
	 * That there is exactly one ring is structural rather than pixel-asserted:
	 * `AccuracyRing` has one caller, `OwnPosition`, and `PlayerMarker` draws no
	 * map layer at all. A WebGL fill is not something a DOM assertion can count.
	 */
	ana.channelTunnel.leave();
	await expect(ana.page.getByTestId("marker-Ben")).toBeVisible({
		timeout: 45_000,
	});
	await expect(ana.page.getByTestId("marker-age-Ben")).toContainText("±");

	await ana.page.getByTestId("marker-Ben").click();
	await expect(ana.page.getByTestId("sheet-accuracy")).toContainText("±");

	for (const phone of [ana, ben]) await phone.close();
});

test("6. follow, drag to free, recenter", async ({ browser }) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await openMap(ana, code);
	await expect(ana.page.getByTestId("own-marker")).toBeVisible({
		timeout: 30_000,
	});

	const control = ana.page.getByTestId("cycle-camera");
	await expect(control).toHaveAttribute("data-camera-mode", "free");

	await control.click();
	await expect(control).toHaveAttribute("data-camera-mode", "follow");

	// A drag is an unambiguous statement about what you want to look at.
	const canvas = ana.page.locator(".maplibregl-canvas");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("no map canvas");
	await ana.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await ana.page.mouse.down();
	await ana.page.mouse.move(
		box.x + box.width / 2 - 120,
		box.y + box.height / 2,
	);
	await ana.page.mouse.up();

	await expect(control).toHaveAttribute("data-camera-mode", "free");

	await control.click();
	await expect(control).toHaveAttribute("data-camera-mode", "follow");

	await ana.close();
});

test("7. with no compass, no orientation is rendered anywhere", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const code = await createGame(ana);
	await waitForSync(ana);
	await openMap(ana, code);

	await expect(ana.page.getByTestId("own-marker")).toBeVisible({
		timeout: 30_000,
	});
	// No arrow…
	await expect(ana.page.getByTestId("own-heading")).toHaveCount(0);

	/**
	 * …and no `followHeading` mode offered. Cycling all the way round returns to
	 * `free` after `follow`, rather than passing through a mode that is silently
	 * equivalent to it. m2-spec §8.
	 */
	const control = ana.page.getByTestId("cycle-camera");
	await control.click();
	await expect(control).toHaveAttribute("data-camera-mode", "follow");
	await control.click();
	await expect(control).toHaveAttribute("data-camera-mode", "free");

	// And the map is otherwise fully usable.
	await expect(ana.page.getByTestId("map-canvas")).toBeVisible();

	await ana.close();
});

test("8. the hider's blindness toggle hides teams and transmits nothing", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const cara = await openPhone(browser, "Cara", {
		geolocation: { longitude: 13.5, latitude: 52.45 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana, ben], side: "hider" },
		{ name: "Seekers", phones: [cara], side: "seeker" },
	]);
	await openMap(cara, code);
	await openMap(ana, code);
	await expect(ana.page.getByTestId("my-role")).toHaveText("hider");

	await expect(ana.page.getByTestId("marker-Cara")).toBeVisible({
		timeout: 30_000,
	});

	const gameId = await gameIdForCode(code);
	const seqsBefore = await eventSeqs(gameId);
	const sentBefore = ana.sentFrames.length;

	await ana.page.getByTestId("toggle-blindness").click();

	// The search is gone; their own team is not.
	await expect(ana.page.getByTestId("marker-Cara")).toHaveCount(0);
	await expect(ana.page.getByTestId("blindness-notice")).toBeVisible();
	await expect(ana.page.getByTestId("own-marker")).toBeVisible();

	// Nothing about it reaches the wire or the log. m2-spec §9.
	const sentAfterToggle = ana.sentFrames.slice(sentBefore);
	expect(sentAfterToggle.filter((frame) => frame.includes("blind"))).toEqual(
		[],
	);
	expect(await eventSeqs(gameId)).toEqual(seqsBefore);

	// Reversible in one tap, and what comes back is the current truth.
	await ana.page.getByTestId("toggle-blindness").click();
	await expect(ana.page.getByTestId("marker-Cara")).toBeVisible({
		timeout: 30_000,
	});
	await expect(ana.page.getByTestId("blindness-notice")).toHaveCount(0);

	// A seeker is not offered it at all: they see their own team and nobody else.
	await expect(cara.page.getByTestId("toggle-blindness")).toHaveCount(0);

	for (const phone of [ana, ben, cara]) await phone.close();
});

test("9. battery is three states, and never a remembered one", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
		noBattery: true,
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana, ben], side: "hider" },
		{ name: "Seekers", phones: [], side: "seeker" },
	]);
	await openMap(ben, code);
	await openMap(ana, code);

	await expect(ana.page.getByTestId("marker-Ben")).toBeVisible({
		timeout: 30_000,
	});
	await ana.page.getByTestId("marker-Ben").click();

	// Unavailable reads as unavailable, and never as "0%".
	await expect(ana.page.getByTestId("sheet-battery")).toHaveText(
		"battery unavailable",
	);
	await ana.page.getByTestId("close-player-sheet").click();

	/**
	 * Ben goes into a tunnel. His position stays and keeps ageing — he was at
	 * Zoologischer Garten, and a player can act on that. The battery goes,
	 * because a level from a phone that has been out of contact ever since is a
	 * value that gets acted on and is wrong. m2-spec §7.
	 *
	 * The other half of the same rule — battery dropping when the *fix* greys out
	 * past ten minutes — is asserted in `staleness.test.ts`, where eleven minutes
	 * is an argument rather than eleven minutes of a faked clock driving a live
	 * sync socket.
	 */
	ben.channelTunnel.enter();

	await expect(ana.page.getByTestId("marker-Ben")).toContainText("offline", {
		timeout: 30_000,
	});
	await ana.page.getByTestId("marker-Ben").click();
	await expect(ana.page.getByTestId("sheet-battery")).toHaveCount(0);
	await expect(ana.page.getByTestId("sheet-last-seen")).not.toHaveText(
		"no position",
	);

	for (const phone of [ana, ben]) await phone.close();
});

test("10. a cold start with no connection shows the app and a coordinate", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana", { tiles: "blocked" });
	const code = await createGame(ana);
	await waitForSync(ana);

	// Underground before the map is opened: no tiles, and no resolved queries.
	ana.tunnel.enter();
	ana.channelTunnel.enter();
	await openMap(ana, code);

	// The map itself says why it is empty. Not a spinner, not an error.
	await expect(ana.page.getByTestId("map-unavailable")).toBeVisible({
		timeout: 30_000,
	});
	// And the game says it has not loaded, because Zero resolves named queries on
	// the server and there is nothing to resolve them with.
	await expect(ana.page.getByTestId("game-not-loaded")).toBeVisible();
	// Own position and a coordinate readout regardless.
	await expect(ana.page.getByTestId("own-readout")).toContainText("±", {
		timeout: 30_000,
	});
	// And no marker for anybody else, because there is nothing synced to make one
	// from.
	await expect(ana.page.locator("[data-testid^='marker-']")).toHaveCount(0);

	await ana.close();
});

test("11. a seeker's store holds no hider position rows while the round runs", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ben], side: "hider" },
		{ name: "Seekers", phones: [ana], side: "seeker" },
	]);
	await openDebug(ben, code);
	await openDebug(ana, code);

	for (const phone of [ben, ana]) {
		await phone.page.getByTestId("sample-position").click();
	}

	/**
	 * The database has the hiders' track. The seeker's synced store does not, and
	 * that gap is the query-side half of the filter — the half the socket-frame
	 * assertions in test 2 cannot see. m2-spec §7 and §13.
	 */
	const hiderTeamId = await teamIdForName(code, "Hiders");
	await expect
		.poll(() => positionCountForTeam(hiderTeamId), { timeout: 45_000 })
		.toBeGreaterThan(0);

	await expect(ana.page.getByTestId("position-log-size")).not.toHaveText(
		"synced: 0",
		{ timeout: 45_000 },
	);

	// Her own team's rows, by id — and not one of the hiders', ever.
	const seekerTeamId = await teamIdForName(code, "Seekers");
	const seekerRows = await positionIdsForTeam(seekerTeamId);
	const hiderRows = await positionIdsForTeam(hiderTeamId);
	expect(hiderRows.length).toBeGreaterThan(0);

	const syncedByAna = await syncedPositionIds(ana);
	expect(syncedByAna.filter((id) => hiderRows.includes(id))).toEqual([]);
	expect(syncedByAna.some((id) => seekerRows.includes(id))).toBe(true);

	for (const phone of [ana, ben]) await phone.close();
});

/**
 * The other half of test 11, and the reason the query was widened. m2-spec §4,
 * _Trails_.
 *
 * A hider is entitled to every seeker's live position, and a trail is that
 * same position half a minute at a time — so the durable log has to reach them,
 * or seekers are the only players on this map with any history behind them.
 */
test("13. a hider's store holds the seekers' position rows while the round runs", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Seekers", phones: [ben], side: "seeker" },
	]);
	await openDebug(ben, code);
	await openDebug(ana, code);

	for (const phone of [ben, ana]) {
		await phone.page.getByTestId("sample-position").click();
	}

	const seekerTeamId = await teamIdForName(code, "Seekers");
	await expect
		.poll(() => positionCountForTeam(seekerTeamId), { timeout: 45_000 })
		.toBeGreaterThan(0);
	const seekerRows = await positionIdsForTeam(seekerTeamId);

	// Every seeker row, by id, in the hider's store.
	await expect
		.poll(
			async () => {
				const synced = await syncedPositionIds(ana);
				return seekerRows.every((id) => synced.includes(id));
			},
			{ timeout: 45_000 },
		)
		.toBe(true);

	for (const phone of [ana, ben]) await phone.close();
});

/**
 * Seeker teams play against each other. Widening the log for hiders must not
 * widen it sideways. m2-spec §7 and §4, _Trails_.
 */
test("14. one seeker team's store holds nothing of another's", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});
	const cara = await openPhone(browser, "Cara", {
		geolocation: { longitude: 13.45, latitude: 52.49 },
	});

	const code = await createGame(ana);
	for (const phone of [ben, cara]) await joinGame(phone, code);
	for (const phone of [ana, ben, cara]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Alpha", phones: [ben], side: "seeker" },
		{ name: "Bravo", phones: [cara], side: "seeker" },
	]);
	for (const phone of [cara, ben, ana]) await openDebug(phone, code);
	for (const phone of [cara, ben, ana]) {
		await phone.page.getByTestId("sample-position").click();
	}

	const alphaTeamId = await teamIdForName(code, "Alpha");
	const bravoTeamId = await teamIdForName(code, "Bravo");
	for (const teamId of [alphaTeamId, bravoTeamId]) {
		await expect
			.poll(() => positionCountForTeam(teamId), { timeout: 45_000 })
			.toBeGreaterThan(0);
	}

	// Alpha has its own track...
	const alphaRows = await positionIdsForTeam(alphaTeamId);
	await expect
		.poll(
			async () => {
				const synced = await syncedPositionIds(ben);
				return alphaRows.every((id) => synced.includes(id));
			},
			{ timeout: 45_000 },
		)
		.toBe(true);

	// ...and not one row of Bravo's, which is a rival rather than a teammate.
	const bravoRows = await positionIdsForTeam(bravoTeamId);
	const syncedByBen = await syncedPositionIds(ben);
	expect(bravoRows.length).toBeGreaterThan(0);
	expect(syncedByBen.filter((id) => bravoRows.includes(id))).toEqual([]);

	for (const phone of [ana, ben, cara]) await phone.close();
});

/**
 * And the same rule, on the map that reads it. m2-spec §4, _Trails_.
 *
 * The line itself is WebGL and cannot be scraped, so the layer publishes the
 * player ids it drew. Ids only: a list of coordinates in the accessibility
 * tree would be the leak the query is written to prevent.
 */
test("15. a hider's map draws the seeker's trail, and the seeker's map does not draw the hider's", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben", {
		geolocation: { longitude: 13.3327, latitude: 52.5073 },
	});

	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);

	await setUpRound(ana, code, [
		{ name: "Hiders", phones: [ana], side: "hider" },
		{ name: "Seekers", phones: [ben], side: "seeker" },
	]);
	for (const phone of [ben, ana]) await openDebug(phone, code);

	// Two logged points each, in two different places: a trail, not a dot.
	for (const phone of [ben, ana]) {
		await phone.page.getByTestId("sample-position").click();
	}
	await walkAndSample(ben, { longitude: 13.34, latitude: 52.51 });
	await walkAndSample(ana, { longitude: 13.42, latitude: 52.53 });

	const anaId = await playerIdForName(code, "Ana");
	const benId = await playerIdForName(code, "Ben");

	await openMap(ana, code);
	await expect(ana.page.getByTestId("my-role")).toHaveText("hider");
	// The hider sees where the seeker has been, and their own track.
	await expect(ana.page.getByTestId("player-trails")).toContainText(benId, {
		timeout: 45_000,
	});
	await expect(ana.page.getByTestId("player-trails")).toContainText(anaId);

	await openMap(ben, code);
	await expect(ben.page.getByTestId("my-role")).toHaveText("seeker");
	await expect(ben.page.getByTestId("player-trails")).toContainText(benId, {
		timeout: 45_000,
	});
	// And never the hider's, because the rows are not in the seeker's store.
	await expect(ben.page.getByTestId("player-trails")).not.toContainText(anaId);

	for (const phone of [ana, ben]) await phone.close();
});

/**
 * What this app asks OpenFreeMap for, asserted at the point it asks — and
 * answered here rather than by OpenFreeMap. m2-spec §3 and §13.
 *
 * The suite never calls the real service: it is free, keyless and uncapped, and
 * putting a run's worth of load on it every time somebody types `npm run
 * test:e2e` buys nothing. That it serves tiles is an assumption.
 *
 * What is *not* an assumption is that this app manages to ask. Vector tiles are
 * fetched from a worker, and prebundling MapLibre once broke that worker so
 * completely that every request hung with no error event — a correctly sized map
 * showing nothing but the style's background colour, with the style, the sprite
 * and the TileJSON all fetched successfully. A tile request arriving at the
 * interceptor is the evidence that the worker is alive, and it costs the real
 * service nothing.
 */
test("12. the map asks the configured provider, and its tile worker is alive", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana", { colorScheme: "light" });
	const code = await createGame(ana);
	await waitForSync(ana);
	await openMap(ana, code);

	/**
	 * Nothing from `/styles/`: both styles are the app's own —
	 * `apps/web/src/map/light-style.ts` and `dark-style.ts` — so what
	 * OpenFreeMap is asked for is the data underneath them. The TileJSON named
	 * by the `openmaptiles` source is the first of those asks.
	 */
	const tileJson = () =>
		ana.tileRequests.filter((url) => url.includes("/planet")).length;

	await expect.poll(tileJson, { timeout: 30_000 }).toBeGreaterThan(0);
	expect(
		ana.tileRequests.filter((url) => url.includes("/styles/")),
	).toHaveLength(0);

	/**
	 * A theme change is a different style, and a different style is a new map —
	 * which asks for the source again. Two styles that only differ in their
	 * paint are indistinguishable at this interceptor, so this is the assertion
	 * that the swap happened at all.
	 */
	const before = tileJson();
	await ana.page.emulateMedia({ colorScheme: "dark" });

	await expect.poll(tileJson, { timeout: 30_000 }).toBeGreaterThan(before);

	// And the worker got far enough to ask for tiles.
	await expect
		.poll(() => ana.tileRequests.filter((url) => url.endsWith(".pbf")).length, {
			timeout: 30_000,
		})
		.toBeGreaterThan(0);

	// The credit OpenFreeMap and OpenStreetMap's licence both require: on screen,
	// exactly once, and not behind a disclosure control.
	await expect(ana.page.getByTestId("map-attribution")).toHaveText(
		"OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
	);
	await expect(ana.page.getByText("OpenMapTiles")).toHaveCount(1);

	await ana.close();
});
