import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { setPendingHidingDuration } from "./db";

/** One browser context is one phone. m0-spec §12. */
export type Phone = {
	readonly name: string;
	readonly context: BrowserContext;
	readonly page: Page;
	/** Every WebSocket frame this phone received, for the visibility assertion. */
	readonly frames: string[];
	/** And every one it sent, for "this toggle transmits nothing". m2-spec §9. */
	readonly sentFrames: string[];
	readonly tunnel: Tunnel;
	/**
	 * The ephemeral socket, cut separately from Zero's.
	 *
	 * They are different servers on different ports and they fail independently
	 * in the field — a phone can be syncing and not broadcasting. m2-spec §6's
	 * regression guard needs the presence socket specifically.
	 */
	readonly channelTunnel: Tunnel;
	/**
	 * Every URL this phone asked OpenFreeMap for — and was answered by the stub
	 * rather than by OpenFreeMap. m2-spec §13.
	 */
	readonly tileRequests: string[];
	/** Any HTTP request outside the app's local servers and intercepted tile stub. */
	readonly externalRequests: string[];
	close(): Promise<void>;
};

/**
 * A tunnel this test can drive.
 *
 * `context.setOffline` blocks new connections but leaves an established
 * WebSocket alive, so Zero stays connected through it — and reloading with the
 * socket blocked is no good either, because Zero 1.x resolves named queries on
 * the server and a cold start offline therefore has no data to show. Proxying
 * the sync socket is the only way to cut it mid-session, which is what an
 * actual tunnel does to an actual phone.
 */
export type Tunnel = {
	enter(): void;
	leave(): void;
};

async function installTunnel(page: Page, pattern: RegExp): Promise<Tunnel> {
	const state = { blocked: false, cut: null as (() => void) | null };

	await page.routeWebSocket(pattern, (ws) => {
		if (state.blocked) {
			ws.close();
			return;
		}
		const server = ws.connectToServer();
		ws.onMessage((message) => server.send(message));
		server.onMessage((message) => ws.send(message));
		state.cut = () => ws.close();
	});

	return {
		enter() {
			state.blocked = true;
			state.cut?.();
		},
		leave() {
			state.blocked = false;
		},
	};
}

/**
 * **The acceptance suite never calls OpenFreeMap.** m2-spec §13.
 *
 * Not a convenience and not a mode: every phone intercepts `tiles.openfreemap.org`
 * unconditionally, and no request to it ever leaves the machine. OpenFreeMap
 * serves this project for free with no key and no request ceiling, and a test
 * suite that hammers it on every run — locally, in CI, once per phone per case —
 * is putting artificial load on somebody else's generosity for no information.
 * That the real service serves real tiles is an assumption, not a thing this
 * suite has any business verifying.
 *
 * `stub` answers with a minimal style that still declares a vector source, so
 * MapLibre reaches `load` *and* goes on to ask its worker for tiles. That second
 * part is deliberate: the requests arriving here are what proves the tile worker
 * is alive, which is the one thing a style-only stub could not tell you and the
 * exact defect §3 records.
 *
 * `blocked` refuses everything, which is what a phone underground actually
 * sees, and is how the cold-start test gets its empty canvas.
 */
export type TileMode = "stub" | "blocked";

export const TILE_HOST = "https://tiles.openfreemap.org";
const STUB_TILE_URL = `${TILE_HOST}/stub/{z}/{x}/{y}.pbf`;

const STUB_STYLE = JSON.stringify({
	version: 8,
	sources: {
		openmaptiles: {
			type: "vector",
			tiles: [STUB_TILE_URL],
			minzoom: 0,
			maxzoom: 14,
		},
	},
	layers: [
		{
			id: "background",
			type: "background",
			paint: { "background-color": "#eeeeee" },
		},
		{
			id: "stub-roads",
			type: "line",
			source: "openmaptiles",
			"source-layer": "transportation",
			paint: { "line-color": "#cccccc" },
		},
		{
			id: "stub-buildings-flat",
			type: "fill",
			source: "openmaptiles",
			"source-layer": "building",
			paint: { "fill-color": "#dddddd" },
		},
	],
});

const LOCAL_ORIGINS = new Set([
	"http://localhost:3000",
	"http://localhost:4848",
	"http://localhost:5173",
	"https://localhost:5173",
]);

async function installThirdPartyGuard(
	context: BrowserContext,
	requests: string[],
): Promise<void> {
	await context.route("http://**/*", async (route) => {
		const url = route.request().url();
		if (LOCAL_ORIGINS.has(new URL(url).origin)) {
			await route.continue();
			return;
		}
		requests.push(url);
		await route.abort("blockedbyclient");
	});
	await context.route("https://**/*", async (route) => {
		const url = route.request().url();
		if (LOCAL_ORIGINS.has(new URL(url).origin)) {
			await route.continue();
			return;
		}
		requests.push(url);
		await route.abort("blockedbyclient");
	});
}

async function installTiles(
	context: BrowserContext,
	mode: TileMode,
	requests: string[],
): Promise<void> {
	// On the context rather than the page, so nothing a page spawns can slip out
	// to the real host either.
	await context.route(`${TILE_HOST}/**`, async (route) => {
		const url = route.request().url();
		requests.push(url);

		if (mode === "blocked") {
			await route.abort("internetdisconnected");
			return;
		}
		if (url.includes("/styles/")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: STUB_STYLE,
			});
			return;
		}
		// An empty body is a valid empty vector tile: the request is the part that
		// matters here, and painting nothing keeps the canvas predictable.
		await route.fulfill({
			status: 200,
			contentType: "application/x-protobuf",
			body: "",
		});
	});
}

export type PhoneOptions = {
	geolocation?: { longitude: number; latitude: number };
	tiles?: TileMode;
	/**
	 * Take the Battery Status API away, which is the state several browsers ship
	 * in and the reason m0-spec §10 made capabilities first-class. m2-spec §7.
	 */
	noBattery?: boolean;
	/** Defaults to the host. Tests that name a style pin this. */
	colorScheme?: "light" | "dark";
};

export async function openPhone(
	browser: Browser,
	name: string,
	options: PhoneOptions = {},
): Promise<Phone> {
	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		permissions: ["geolocation"],
		geolocation: options.geolocation ?? {
			longitude: 13.4132,
			latitude: 52.5219,
		},
		...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
	});
	const page = await context.newPage();

	if (options.noBattery) {
		await page.addInitScript(() => {
			Object.defineProperty(Navigator.prototype, "getBattery", {
				value: undefined,
				configurable: true,
			});
		});
	}

	const frames: string[] = [];
	const sentFrames: string[] = [];
	page.on("websocket", (socket) => {
		socket.on("framereceived", (frame) => {
			if (typeof frame.payload === "string") frames.push(frame.payload);
		});
		socket.on("framesent", (frame) => {
			if (typeof frame.payload === "string") sentFrames.push(frame.payload);
		});
	});

	const tileRequests: string[] = [];
	const externalRequests: string[] = [];
	await installThirdPartyGuard(context, externalRequests);
	await installTiles(context, options.tiles ?? "stub", tileRequests);
	const tunnel = await installTunnel(page, /localhost:4848|\/zero-cache/);
	const channelTunnel = await installTunnel(page, /\/api\/ephemeral/);

	await page.goto("/");
	return {
		name,
		context,
		page,
		frames,
		sentFrames,
		tunnel,
		channelTunnel,
		tileRequests,
		externalRequests,
		close: async () => {
			expect(externalRequests).toEqual([]);
			await context.close();
		},
	};
}

/**
 * The area step has no default. Berlin the Land is the city-tab choice that
 * stands in for the old starter board.
 */
export async function chooseBerlinArea(phone: Phone): Promise<void> {
	await phone.page.getByTestId("setup-area-district").waitFor();
	await phone.page.getByTestId("setup-area-district").click();
	await phone.page.getByTestId("area-district-Berlin").waitFor();
	await phone.page.getByTestId("area-district-Berlin").click();
	await phone.page.getByTestId("area-district-add").click();
	await expect(phone.page.getByTestId("area-editor")).toBeVisible();
	await phone.page.getByTestId("area-use").click();
	await expect(phone.page.getByTestId("setup-area-chosen")).toBeVisible({
		timeout: 20_000,
	});
}

/** The create wizard's name step: say who you are, swear you own the box. */
export async function submitCreateName(phone: Phone): Promise<void> {
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("own-copy").click();
	await phone.page.getByTestId("create-confirm").click();
}

/**
 * Creating and joining both land in the lobby at `/g/:code`, and both are now
 * wizards rather than one form: the start screen picks a door, and the name is
 * asked for inside the flow it opened. m1-spec §8.
 */
export async function createGame(phone: Phone): Promise<string> {
	await phone.page.getByTestId("create-game").click();
	await submitCreateName(phone);

	/**
	 * The wizard: area, transit, size, review. Area has no default — the host
	 * picks Berlin (or a district) before the rest of the flow has counts that
	 * mean anything.
	 */
	await chooseBerlinArea(phone);
	await phone.page.getByTestId("setup-area-continue").click();
	await phone.page.getByTestId("setup-transit-continue").click();
	await phone.page.getByTestId("setup-size-continue").click();
	await phone.page.getByTestId("setup-open-lobby").click();

	/**
	 * Read off the URL rather than the screen. The join code is not worn in the
	 * lobby header any more — it is something you hand over once, so it lives
	 * behind the share control — and the address bar is where it is always true.
	 */
	await expect(phone.page.getByTestId("lobby")).toBeVisible();
	return codeFromUrl(phone);
}

function codeFromUrl(phone: Phone): string {
	return new URL(phone.page.url()).pathname.split("/")[2] ?? "";
}

/** Both doors land in the same place, and this is what "landed" means. */
async function expectInLobby(phone: Phone, code: string): Promise<void> {
	await expect(phone.page.getByTestId("lobby")).toBeVisible();
	expect(codeFromUrl(phone)).toBe(code);
}

export async function joinGame(phone: Phone, code: string): Promise<void> {
	await enterJoinCode(phone, code);
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("join-game").click();
	await expectInLobby(phone, code);
}

/** Join and get refused, which is only possible after a host removed you. */
export async function joinRefused(phone: Phone, code: string): Promise<string> {
	await enterJoinCode(phone, code);
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("join-game").click();
	await expect(phone.page.getByTestId("join-error")).toBeVisible();
	return (await phone.page.getByTestId("join-error").textContent()) ?? "";
}

/**
 * The first of the join wizard's two steps. Continue stays disabled until the
 * code has resolved to a real game, so waiting for the preview is waiting for
 * the button.
 */
async function enterJoinCode(phone: Phone, code: string): Promise<void> {
	// From the front door: a phone that has just been refused is still standing
	// on the step that refused it.
	await phone.page.goto("/");
	await phone.page.getByTestId("join-by-code").click();
	await phone.page.getByTestId("join-code").fill(code);
	await expect(phone.page.getByTestId("join-preview")).toBeVisible();
	await phone.page.getByTestId("join-continue").click();
}

/** The M0 debug harness, which lives under the game's own URL. m1-spec §8. */
export async function openDebug(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}/debug`);
	await expect(phone.page.getByTestId("game-code")).toHaveText(code);
}

export async function openLobby(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}`);
	await expectInLobby(phone, code);
}

/** Host-only. Opens the confirmation sheet, then starts the seeking clock. */
export async function startSeekingPhase(phone: Phone): Promise<void> {
	await expect(phone.page.getByTestId("start-seeking")).toBeVisible();
	await phone.page.getByTestId("start-seeking").click();
	await expect(phone.page.getByTestId("confirm-start-seeking")).toBeVisible();
	await phone.page.getByTestId("confirm-start-seeking").click();
}

/** The map. m2-spec §12. */
export async function openMap(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}/map`);
	await expect(phone.page.getByTestId("map-canvas")).toBeVisible();
}

/** Zero has to be genuinely connected before a test can trust what it reads. */
export async function waitForSync(phone: Phone): Promise<void> {
	await expect(phone.page.getByTestId("connection-state")).toHaveText(
		"connected",
		{ timeout: 30_000 },
	);
}

/**
 * What one phone actually received about another on the ephemeral channel.
 *
 * Read off the socket frames rather than the UI, because this is what fails
 * loudly when somebody widens a fan-out filter by accident three milestones
 * from now. m0-spec §12, test 6.
 */
export type SeenPresence = {
	readonly displayName: string;
	readonly teamId: string | null;
	readonly role: string | null;
	readonly fix: unknown;
	readonly battery: unknown;
	/** m2-spec §5 and §6: measured on the server, and never about a rival team. */
	readonly fixAgeMs: number | null;
	readonly online: boolean | null;
};

function readEntries(frame: string): SeenPresence[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(frame);
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const entries = Reflect.get(parsed, "entries");
	if (!Array.isArray(entries)) return [];

	return entries.flatMap((entry: unknown) => {
		if (typeof entry !== "object" || entry === null) return [];
		const displayName = Reflect.get(entry, "displayName");
		if (typeof displayName !== "string") return [];
		return [
			{
				displayName,
				teamId: Reflect.get(entry, "teamId") ?? null,
				role: Reflect.get(entry, "role") ?? null,
				fix: Reflect.get(entry, "fix") ?? null,
				battery: Reflect.get(entry, "battery") ?? null,
				fixAgeMs: Reflect.get(entry, "fixAgeMs") ?? null,
				online: Reflect.get(entry, "online") ?? null,
			} satisfies SeenPresence,
		];
	});
}

/** Every presence entry this phone was ever sent about `displayName`. */
export function presenceOf(phone: Phone, displayName: string): SeenPresence[] {
	return phone.frames
		.filter((frame) => frame.includes('"presence"'))
		.flatMap(readEntries)
		.filter((entry) => entry.displayName === displayName);
}

export function sawPresence(phone: Phone): boolean {
	return phone.frames.some((frame) => frame.includes('"presence"'));
}

/**
 * The lobby, reworked: a team is made in the identity drawer, and who is on it
 * is settled on the players screen. Two different questions, two places.
 */
export async function createTeam(phone: Phone, name: string): Promise<void> {
	await phone.page.getByTestId("create-team").click();
	await phone.page.getByTestId("team-name-input").fill(name);
	await phone.page.getByTestId("team-editor-done").click();
	await expect(phone.page.getByTestId(`team-${name}`)).toBeVisible();
}

/** Which side a team plays, set in the same drawer that named it. Host only. */
export async function setSide(
	phone: Phone,
	team: string,
	side: "hider" | "seeker",
): Promise<void> {
	await phone.page.getByTestId(`team-${team}`).click();
	await phone.page.getByTestId(`side-${side}`).click();
	await phone.page.getByTestId("team-editor-done").click();
	// Read back off the board's own grouping rather than the button that was
	// pressed, so this asserts the round's assignment rather than the click.
	await expect(
		phone.page.getByTestId(`side-${side}s`).getByTestId(`team-${team}`),
	).toBeVisible();
}

/**
 * The M0 debug harness has roster controls of its own — a flat list of teams
 * with a name field beside it — and the specs that drive it are testing sync
 * rather than the lobby. They are deliberately separate from the lobby helpers
 * above: the lobby moved and the harness did not.
 */
export async function createTeamInHarness(
	phone: Phone,
	name: string,
): Promise<void> {
	await phone.page.getByTestId("team-name").fill(name);
	await phone.page.getByTestId("create-team").click();
	await expect(phone.page.getByTestId(`team-${name}`)).toBeVisible();
}

export async function joinTeamInHarness(
	phone: Phone,
	name: string,
): Promise<void> {
	await phone.page.getByTestId(`join-${name}`).click();
	await expect(phone.page.getByTestId(`leave-${name}`)).toBeVisible();
}

/**
 * The host hat. Claimable from the game menu; droppable from your own player
 * sheet. More than one at a time is fine. m1-spec §6.
 */
export async function toggleHost(phone: Phone): Promise<void> {
	const badge = phone.page.getByTestId(`host-badge-${phone.name}`);
	if ((await badge.count()) > 0) {
		await phone.page.getByTestId(`player-${phone.name}`).click();
		await phone.page.getByTestId("release-host").click();
		return;
	}
	await phone.page.getByTestId("lobby-menu").click();
	await phone.page.getByTestId("claim-host").click();
}

/**
 * Ready is per person, so every phone says it for itself — on the lobby, next
 * to everybody else's tick. m1-spec §11.
 *
 * The briefing gates it: saying you are ready without having seen the area is
 * not a thing worth allowing, so the first tap reads it.
 */
export async function readyUp(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}`);
	const briefing = phone.page.getByTestId("read-briefing");
	const ready = phone.page.getByTestId("mark-ready");
	// The lobby paints after Zero hydrates. Checking visibility once would
	// race the load and wait for a button that only exists after the briefing.
	await expect(briefing.or(ready)).toBeVisible();
	if (await briefing.isVisible()) {
		await briefing.click();
		await phone.page.getByTestId("mark-ready").click();
	} else {
		await ready.click();
	}
	await expect(phone.page.getByTestId(`ready-state-${phone.name}`)).toHaveText(
		"ready",
	);
}

/**
 * The whistle. Held rather than tapped, and only offered once the last person
 * has said yes — so everybody rides up first. The host is `phones[0]`.
 */
export async function startHiding(
	phones: readonly Phone[],
	code: string,
	minutes?: string,
): Promise<void> {
	const host = phones[0];
	if (!host) throw new Error("startHiding needs at least the host");
	for (const phone of phones) await readyUp(phone, code);
	if (minutes) {
		await setPendingHidingDuration(code, minutes);
		// A raw SQL write is not in the client replica until it hydrates again.
		await host.page.goto(`/g/${code}`);
		await waitForSync(host);
	} else {
		await host.page.goto(`/g/${code}`);
	}
	// A hold, not a tap: the fill is the confirmation.
	await host.page.getByTestId("start-hiding").click({ delay: 1_000 });
	await expect(host.page.getByTestId("lobby-round-phase")).toContainText(
		"hiding",
		{ timeout: 20_000 },
	);
}

/**
 * Putting somebody on a team. Players join by opening the team; a host can
 * also move anyone from that person's sheet. m1-spec §5.
 */
export async function joinTeam(phone: Phone, name: string): Promise<void> {
	await phone.page.getByTestId(`team-${name}`).click();
	await phone.page.getByTestId(`join-${name}`).click();
	await expect(
		phone.page
			.getByTestId(`members-${name}`)
			.getByTestId(`player-${phone.name}`),
	).toBeVisible();
}

// --- M4: the game area builder --------------------------------------------

/** The builder, reachable from the lobby by anyone wearing the host hat. m4-spec §9. */
export async function openBuilder(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}/build`);
	await expect(phone.page.getByTestId("map-canvas")).toBeVisible();
	// The draw tool captures taps only once MapLibre is alive *and* React has
	// mounted the handler underneath it. Tapping before that silently drops
	// vertices, which is a slow and confusing way for a test to fail.
	await expect(phone.page.getByTestId("draw-hint")).toBeAttached();
	await expect(phone.page.getByTestId("builder-map-ready")).toBeAttached();
}

/**
 * Tap a ring onto the map, in fractions of the canvas.
 *
 * Fractions rather than pixels so a test says "a box across the top of the
 * view" rather than a number that means nothing and breaks when the viewport
 * moves.
 *
 * **Keep `fy` between roughly 0.12 and 0.28.** The readout sits across the top
 * and the draw and save panels fill everything below about 0.33, and a tap that
 * lands on one of those is swallowed. The vertex count is checked at the end
 * because the failure is otherwise silent: a bowtie that lost one corner is a
 * triangle, which has a perfectly good non-zero area and fails four assertions
 * later for reasons that look like a geometry bug.
 */
export async function drawRing(
	phone: Phone,
	corners: readonly (readonly [number, number])[],
): Promise<void> {
	const canvas = phone.page.getByTestId("map-canvas");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("the map canvas has no box to tap in");
	const count = phone.page.getByTestId("draw-vertex-count");
	for (const [index, corner] of corners.entries()) {
		const [fx, fy] = corner;
		await canvas.click({
			position: { x: box.width * fx, y: box.height * fy },
		});
		// One at a time, and waited for. Two taps in the same animation frame get
		// read as a double-click and MapLibre zooms instead of passing the second
		// one on, and this also makes a swallowed tap name the corner that was
		// lost rather than the total.
		await expect(count).toHaveText(String(index + 1));
	}
}

/** A rectangle, tapped corner to corner in order. */
export const BOX: readonly (readonly [number, number])[] = [
	[0.3, 0.13],
	[0.7, 0.13],
	[0.7, 0.27],
	[0.3, 0.27],
];

/** The same four corners in crossing order — a bowtie. m4-spec §3. */
export const BOWTIE: readonly (readonly [number, number])[] = [
	[0.3, 0.13],
	[0.7, 0.13],
	[0.3, 0.27],
	[0.7, 0.27],
];

/** A small ring and a large one, for "the count follows the area". */
export const SMALL_BOX: readonly (readonly [number, number])[] = [
	[0.47, 0.18],
	[0.53, 0.18],
	[0.53, 0.23],
	[0.47, 0.23],
];

export const LARGE_BOX: readonly (readonly [number, number])[] = [
	[0.12, 0.12],
	[0.88, 0.12],
	[0.88, 0.28],
	[0.12, 0.28],
];

export async function nameAndApply(phone: Phone, name: string): Promise<void> {
	await phone.page.getByTestId("map-name").fill(name);
	await phone.page.getByTestId("map-apply").click();
	await expect(phone.page.getByTestId("map-applied")).toBeVisible();
}

export async function nameAndSave(phone: Phone, name: string): Promise<string> {
	await phone.page.getByTestId("map-name").fill(name);
	await phone.page.getByTestId("map-save").click();
	await expect(phone.page.getByTestId("map-code")).toBeVisible();
	const text = (await phone.page.getByTestId("map-code").textContent()) ?? "";
	const code = text.replace(/^.*:\s*/, "").trim();
	if (!code) throw new Error(`no share code in ${text}`);
	return code;
}

/** How many stations the readout says are inside the drawn area. */
export async function stationsInside(phone: Phone): Promise<number> {
	const text =
		(await phone.page.getByTestId("readout-stations").textContent()) ?? "";
	return Number(text.replace(/\D+/g, ""));
}
