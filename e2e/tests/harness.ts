import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

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
		requests.push(route.request().url());
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
};

export async function openPhone(
	browser: Browser,
	name: string,
	options: PhoneOptions = {},
): Promise<Phone> {
	const context = await browser.newContext({
		permissions: ["geolocation"],
		geolocation: options.geolocation ?? {
			longitude: 13.4132,
			latitude: 52.5219,
		},
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
	const tunnel = await installTunnel(page, /localhost:4848/);
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

/** Creating and joining both land in the lobby at `/g/:code`. m1-spec §8. */
export async function createGame(phone: Phone): Promise<string> {
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("create-game").click();
	await expect(phone.page.getByTestId("game-code")).toBeVisible();
	return (await phone.page.getByTestId("game-code").textContent()) ?? "";
}

export async function joinGame(phone: Phone, code: string): Promise<void> {
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("join-code").fill(code);
	await phone.page.getByTestId("join-game").click();
	await expect(phone.page.getByTestId("game-code")).toHaveText(code);
}

/** Join and get refused, which is only possible after a host removed you. */
export async function joinRefused(phone: Phone, code: string): Promise<string> {
	await phone.page.getByTestId("display-name").fill(phone.name);
	await phone.page.getByTestId("join-code").fill(code);
	await phone.page.getByTestId("join-game").click();
	await expect(phone.page.getByTestId("landing-error")).toBeVisible();
	return (await phone.page.getByTestId("landing-error").textContent()) ?? "";
}

/** The M0 debug harness, which lives under the game's own URL. m1-spec §8. */
export async function openDebug(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}/debug`);
	await expect(phone.page.getByTestId("game-code")).toHaveText(code);
}

export async function openLobby(phone: Phone, code: string): Promise<void> {
	await phone.page.goto(`/g/${code}`);
	await expect(phone.page.getByTestId("game-code")).toHaveText(code);
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

export async function createTeam(phone: Phone, name: string): Promise<void> {
	await phone.page.getByTestId("team-name").fill(name);
	await phone.page.getByTestId("create-team").click();
	await expect(phone.page.getByTestId(`team-${name}`)).toBeVisible();
}

export async function joinTeam(phone: Phone, name: string): Promise<void> {
	await phone.page.getByTestId(`join-${name}`).click();
	await expect(phone.page.getByTestId(`leave-${name}`)).toBeVisible();
}
