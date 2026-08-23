import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
	closeDb,
	currentRoundId,
	eventPayloads,
	eventTypes,
	gameIdForCode,
	hiderOutcomes,
	houseRulesText,
	pausesForRound,
	photoRow,
	positionCountForTeam,
	roundStatuses,
	teamIdForName,
} from "./db";
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
 * M5 — game lifecycle. m5-spec §13.
 *
 * Round controls live on the lobby and the map, not the debug harness. Test 5
 * is the guardrail: leaving a zone is a local notice, never a wire write.
 */

const GPS_JPEG = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/found-with-gps.jpg",
);

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

async function sessionToken(phone: Phone): Promise<string> {
	const raw = await phone.page.evaluate(() =>
		localStorage.getItem("zero-lag.session"),
	);
	if (!raw) throw new Error(`${phone.name} has no session`);
	const parsed: unknown = JSON.parse(raw);
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		typeof Reflect.get(parsed, "token") !== "string"
	) {
		throw new Error(`${phone.name} session is missing a token`);
	}
	return Reflect.get(parsed, "token") as string;
}

function hasGpsExif(bytes: Buffer): boolean {
	return (
		bytes.includes(Buffer.from("Exif")) &&
		bytes.includes(Buffer.from([0x25, 0x88]))
	);
}

async function expectPhase(
	phones: readonly Phone[],
	phase: "pending" | "hiding" | "seeking" | "ended",
): Promise<void> {
	for (const phone of phones) {
		const locator = phone.page
			.getByTestId("lobby-round-phase")
			.or(phone.page.getByTestId("round-phase"));
		await expect(locator.first()).toContainText(phase, { timeout: 20_000 });
	}
}

async function startHiding(host: Phone, minutes: string): Promise<void> {
	await host.page.getByTestId("hiding-duration").fill(minutes);
	await host.page.getByTestId("start-hiding").click();
	await expect(host.page.getByTestId("lobby-round-phase")).toContainText(
		"hiding",
	);
}

async function resumeRound(host: Phone): Promise<void> {
	await waitForSync(host);
	await host.page.getByTestId("resume-round").click();
	await expect(host.page.getByTestId("lobby-round-phase")).not.toContainText(
		"paused",
	);
}

function countdownSeconds(text: string): number {
	const match = /^(\d+):(\d{2}) left$/.exec(text);
	const minutes = match?.[1];
	const seconds = match?.[2];
	if (minutes === undefined || seconds === undefined) {
		throw new Error(`expected a hiding countdown, got ${JSON.stringify(text)}`);
	}
	return Number(minutes) * 60 + Number(seconds);
}

async function commitZone(hider: Phone, code: string): Promise<void> {
	await openMap(hider, code);
	await waitForSync(hider);
	await expect(hider.page.getByTestId("hiding-sheet")).toBeVisible();
	await hider.page.getByTestId("commit-zone").click();
	await expect(hider.page.getByTestId("committed-stop")).toBeVisible();
}

async function twoTeamLobby(
	browser: Parameters<typeof openPhone>[0],
	names: readonly [string, string] = ["Ana", "Ben"],
): Promise<{ host: Phone; other: Phone; code: string; phones: Phone[] }> {
	const host = await openPhone(browser, names[0]);
	const other = await openPhone(browser, names[1]);
	const code = await createGame(host);
	await joinGame(other, code);
	for (const phone of [host, other]) await waitForSync(phone);
	await createTeam(host, "Hiders");
	await createTeam(host, "Seekers");
	await joinTeam(host, "Seekers");
	await joinTeam(other, "Hiders");
	await setSide(host, "Hiders", "hider");
	await setSide(host, "Seekers", "seeker");
	return { host, other, code, phones: [host, other] };
}

test("1. a full round, end to end", async ({ browser }) => {
	test.setTimeout(120_000);
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

	await ana.page
		.getByTestId("rules-card")
		.getByTestId("rules-input")
		.fill("no image searching stations");
	await ana.page.getByTestId("rules-card").getByTestId("save-rules").click();
	const gameId = await gameIdForCode(code);
	await expect
		.poll(() => houseRulesText(gameId))
		.toBe("no image searching stations");
	await expect(
		ben.page.getByTestId("rules-card").getByTestId("rules-text"),
	).toHaveText("no image searching stations");

	await startHiding(ana, "30");
	await expectPhase(phones, "hiding");
	expect(await roundStatuses(gameId)).toEqual(["hiding"]);

	await commitZone(ben, code);
	await commitZone(ana, code);

	await openLobby(ana, code);
	await ana.page.getByTestId("start-seeking").click();
	await expectPhase(phones, "seeking");

	await openMap(cara, code);
	await waitForSync(cara);
	await expect(cara.page.getByTestId("found-sheet")).toBeVisible();
	await cara.page
		.getByTestId("found-hider-team")
		.selectOption({ label: "Foxes" });
	await cara.page.getByTestId("mark-found").click();
	await expect(cara.page.getByTestId("unmark-found")).toBeVisible();
	await cara.page
		.getByTestId("found-hider-team")
		.selectOption({ label: "Owls" });
	await cara.page.getByTestId("mark-found").click();
	await expect(cara.page.getByTestId("unmark-found")).toBeVisible();

	await openLobby(ana, code);
	await expect(ana.page.getByTestId("outcome-Foxes")).toContainText("Found by");
	await expect(ana.page.getByTestId("outcome-Owls")).toContainText("Found by");
	await ana.page.getByTestId("end-round").click();
	await expectPhase(phones, "ended");

	await expect
		.poll(
			async () => (await hiderOutcomes(await currentRoundId(gameId))).length,
		)
		.toBe(2);
	const outcomes = await hiderOutcomes(await currentRoundId(gameId));
	expect(outcomes.every((row) => row.durationMillis !== null)).toBe(true);

	for (const phone of phones) await phone.close();
});

test("2. the recorded duration matches a stopwatch", async ({ browser }) => {
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();
	await expect(host.page.getByTestId("lobby-round-phase")).toContainText(
		"seeking",
	);

	const started = Date.now();
	await new Promise((resolve) => setTimeout(resolve, 2_500));
	await openMap(host, code);
	await waitForSync(host);
	await host.page.getByTestId("mark-found").click();
	await expect(host.page.getByTestId("unmark-found")).toBeVisible();
	const stopped = Date.now();

	const gameId = await gameIdForCode(code);
	const hiderTeamId = await teamIdForName(code, "Hiders");
	await expect
		.poll(async () => {
			const rows = await hiderOutcomes(await currentRoundId(gameId));
			return (
				rows.find((row) => row.hiderTeamId === hiderTeamId)?.durationMillis ??
				null
			);
		})
		.toBeGreaterThanOrEqual(2_000);
	const found = (await hiderOutcomes(await currentRoundId(gameId))).find(
		(row) => row.hiderTeamId === hiderTeamId,
	);
	expect(found?.durationMillis).toBeLessThanOrEqual(stopped - started + 2_000);

	for (const phone of phones) await phone.close();
});

test("3. a pause stops every clock and no positions", async ({ browser }) => {
	test.setTimeout(120_000);
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();

	await host.page.getByTestId("pause-reason").fill("food");
	await host.page.getByTestId("pause-round").click();
	await expect(host.page.getByTestId("lobby-round-phase")).toContainText(
		"paused",
	);
	const gameId = await gameIdForCode(code);
	await expect
		.poll(
			async () => (await pausesForRound(await currentRoundId(gameId))).length,
		)
		.toBe(1);

	await openMap(host, code);
	await openMap(other, code);
	await waitForSync(host);
	await waitForSync(other);
	await expect(host.page.getByTestId("round-paused")).toBeVisible();
	const first = await host.page.getByTestId("round-clock").innerText();
	await expect(other.page.getByTestId("round-clock")).toHaveText(first);
	await new Promise((resolve) => setTimeout(resolve, 8_000));
	await expect(host.page.getByTestId("round-clock")).toHaveText(first);
	await expect(other.page.getByTestId("round-clock")).toHaveText(first);

	const seekerTeamId = await teamIdForName(code, "Seekers");
	const before = await positionCountForTeam(seekerTeamId);
	await expect
		.poll(() => positionCountForTeam(seekerTeamId), { timeout: 45_000 })
		.toBeGreaterThan(before);

	await openLobby(host, code);
	await resumeRound(host);
	await openMap(host, code);
	await waitForSync(host);
	await expect(host.page.getByTestId("round-paused")).toHaveCount(0);
	await expect
		.poll(async () => host.page.getByTestId("round-clock").innerText())
		.not.toBe(first);

	for (const phone of phones) await phone.close();
});

test("4. the countdown pauses with the game", async ({ browser }) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);
	await createTeam(ana, "Hiders");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");
	await setSide(ana, "Hiders", "hider");
	await setSide(ana, "Seekers", "seeker");
	await startHiding(ana, "0.25");

	await ana.page.getByTestId("pause-reason").fill("train replacement bus");
	await ana.page.getByTestId("pause-round").click();
	await openMap(ana, code);
	await openMap(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);
	const remaining = await ana.page.getByTestId("round-clock").innerText();
	await expect(ben.page.getByTestId("round-clock")).toHaveText(remaining);
	await new Promise((resolve) => setTimeout(resolve, 6_000));
	await expect(ana.page.getByTestId("round-clock")).toHaveText(remaining);
	await expect(ben.page.getByTestId("round-clock")).toHaveText(remaining);

	await openLobby(ana, code);
	await resumeRound(ana);
	await openMap(ana, code);
	await openMap(ben, code);
	await waitForSync(ana);
	await waitForSync(ben);
	const after = await ana.page.getByTestId("round-clock").innerText();
	const afterBen = await ben.page.getByTestId("round-clock").innerText();
	expect(countdownSeconds(after)).toBeGreaterThanOrEqual(
		countdownSeconds(remaining) - 3,
	);
	expect(countdownSeconds(after)).toBeLessThanOrEqual(
		countdownSeconds(remaining),
	);
	expect(
		Math.abs(countdownSeconds(after) - countdownSeconds(afterBen)),
	).toBeLessThanOrEqual(1);

	await ana.close();
	await ben.close();
});

test("5. leaving your zone tells you and transmits nothing", async ({
	browser,
}) => {
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();
	await expect(other.page.getByTestId("round-phase")).toHaveText("seeking");

	const gameId = await gameIdForCode(code);
	const seqsBefore = await eventTypes(gameId);
	const sentBefore = other.sentFrames.length;

	await other.context.setGeolocation({ longitude: 13.0, latitude: 52.4 });
	await expect(other.page.getByTestId("zone-leave-notice")).toBeVisible({
		timeout: 20_000,
	});

	expect(await eventTypes(gameId)).toEqual(seqsBefore);
	const sentAfter = other.sentFrames.slice(sentBefore);
	expect(
		sentAfter.filter((frame) =>
			/zone|left your hiding|hiderOutcome/i.test(frame),
		),
	).toEqual([]);

	for (const phone of phones) await phone.close();
});

test("6. the countdown reaching zero changes nothing by itself", async ({
	browser,
}) => {
	const ana = await openPhone(browser, "Ana");
	const ben = await openPhone(browser, "Ben");
	const code = await createGame(ana);
	await joinGame(ben, code);
	for (const phone of [ana, ben]) await waitForSync(phone);
	await createTeam(ana, "Hiders");
	await createTeam(ana, "Seekers");
	await joinTeam(ana, "Seekers");
	await joinTeam(ben, "Hiders");
	await setSide(ana, "Hiders", "hider");
	await setSide(ana, "Seekers", "seeker");
	await startHiding(ana, "0.05");

	await openMap(ben, code);
	await expect(ana.page.getByTestId("start-seeking")).toContainText(
		"Hiding time is up",
		{ timeout: 20_000 },
	);
	await expect(ben.page.getByTestId("round-clock")).toHaveText(
		"Hiding time is up",
	);
	const gameId = await gameIdForCode(code);
	expect(await roundStatuses(gameId)).toEqual(["hiding"]);

	await ana.page.getByTestId("start-seeking").click();
	await expect(ben.page.getByTestId("round-phase")).toHaveText("seeking");
	expect(await roundStatuses(gameId)).toEqual(["seeking"]);

	await ana.close();
	await ben.close();
});

test("7. a found is markable by anyone and correctable", async ({
	browser,
}) => {
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();

	await openMap(other, code);
	await waitForSync(other);
	await other.page.getByTestId("mark-found").click();
	await expect(other.page.getByTestId("unmark-found")).toBeVisible();

	await openLobby(host, code);
	await expect(host.page.getByTestId("outcome-Hiders")).toContainText(
		"Found by",
	);

	await other.page.getByTestId("unmark-found").click();
	await expect(host.page.getByTestId("outcome-unfound-Hiders")).toHaveText(
		"Still hiding",
	);

	const gameId = await gameIdForCode(code);
	const foundEvents = await eventPayloads(gameId, "round.hiderFound");
	expect(foundEvents.length).toBeGreaterThanOrEqual(2);
	expect(
		foundEvents.some(
			(payload) => Reflect.get(payload ?? {}, "foundAt") === null,
		),
	).toBe(true);
	expect(
		foundEvents.some(
			(payload) => typeof Reflect.get(payload ?? {}, "foundAt") === "number",
		),
	).toBe(true);

	for (const phone of phones) await phone.close();
});

test("8. a round that ends with a hider unfound records that", async ({
	browser,
}) => {
	const names = ["Ana", "Ben", "Cara"];
	const phones: Phone[] = [];
	for (const name of names) phones.push(await openPhone(browser, name));
	const [ana, ben, cara] = phones as [Phone, Phone, Phone];
	const code = await createGame(ana);
	await joinGame(ben, code);
	await joinGame(cara, code);
	for (const phone of phones) await waitForSync(phone);

	await createTeam(ana, "Foxes");
	await createTeam(ana, "Owls");
	await createTeam(ana, "Bees");
	await joinTeam(ana, "Bees");
	await joinTeam(ben, "Foxes");
	await joinTeam(cara, "Owls");
	await setSide(ana, "Foxes", "hider");
	await setSide(ana, "Owls", "hider");
	await setSide(ana, "Bees", "seeker");
	await startHiding(ana, "30");
	await commitZone(ben, code);
	await commitZone(cara, code);
	await openLobby(ana, code);
	await ana.page.getByTestId("start-seeking").click();

	await openMap(ana, code);
	await waitForSync(ana);
	await ana.page
		.getByTestId("found-hider-team")
		.selectOption({ label: "Foxes" });
	await ana.page.getByTestId("mark-found").click();

	await openLobby(ana, code);
	await ana.page.getByTestId("end-round").click();
	await expect(ana.page.getByTestId("lobby-round-phase")).toContainText(
		"ended",
	);
	await expect(ana.page.getByTestId("outcome-unfound-Owls")).toHaveText(
		"Not found",
	);

	const gameId = await gameIdForCode(code);
	const foxes = await teamIdForName(code, "Foxes");
	const owls = await teamIdForName(code, "Owls");
	await expect
		.poll(async () => {
			const rows = await hiderOutcomes(await currentRoundId(gameId));
			return rows.find((row) => row.hiderTeamId === owls) ?? null;
		})
		.not.toBeNull();
	const outcomes = await hiderOutcomes(await currentRoundId(gameId));
	expect(
		outcomes.find((row) => row.hiderTeamId === foxes)?.durationMillis,
	).toEqual(expect.any(Number));
	expect(outcomes.find((row) => row.hiderTeamId === owls)?.durationMillis).toBe(
		null,
	);

	for (const phone of phones) await phone.close();
});

test("9. a photo survives the round and loses its coordinates", async ({
	browser,
}) => {
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();
	await openMap(host, code);
	await waitForSync(host);
	await host.page.getByTestId("mark-found").click();
	await host.page.getByTestId("found-photo").setInputFiles(GPS_JPEG);
	await expect(host.page.getByTestId("found-photo")).toBeEnabled({
		timeout: 20_000,
	});

	const gameId = await gameIdForCode(code);
	const hiderTeamId = await teamIdForName(code, "Hiders");
	await expect
		.poll(async () => {
			const rows = await hiderOutcomes(await currentRoundId(gameId));
			return (
				rows.find((row) => row.hiderTeamId === hiderTeamId)?.photoId ?? null
			);
		})
		.not.toBeNull();
	const photoId = (await hiderOutcomes(await currentRoundId(gameId))).find(
		(row) => row.hiderTeamId === hiderTeamId,
	)?.photoId;
	if (!photoId) throw new Error("found mark has no photo");

	await openLobby(other, code);
	await expect(other.page.getByTestId(`photo-${photoId}`)).toBeVisible();

	const original = await readFile(GPS_JPEG);
	expect(hasGpsExif(original)).toBe(true);
	const token = await sessionToken(other);
	const response = await other.page.request.get(
		`http://localhost:3000/api/photos/${photoId}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	expect(response.ok()).toBe(true);
	const stored = Buffer.from(await response.body());
	expect(hasGpsExif(stored)).toBe(false);
	expect((await photoRow(photoId))?.gameId).toBe(gameId);

	for (const phone of phones) await phone.close();
});

test("10. the suite makes no third-party request, including /photos", async ({
	browser,
}) => {
	const { host, other, code, phones } = await twoTeamLobby(browser);
	await startHiding(host, "30");
	await commitZone(other, code);
	await openLobby(host, code);
	await host.page.getByTestId("start-seeking").click();
	await openMap(host, code);
	await host.page.getByTestId("mark-found").click();
	await host.page.getByTestId("found-photo").setInputFiles(GPS_JPEG);
	await openLobby(other, code);
	await expect
		.poll(async () => {
			const rows = await hiderOutcomes(
				await currentRoundId(await gameIdForCode(code)),
			);
			return rows.some((row) => row.photoId !== null);
		})
		.toBe(true);

	for (const phone of phones) await phone.close();
});
