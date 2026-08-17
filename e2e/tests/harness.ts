import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** One browser context is one phone. m0-spec §12. */
export type Phone = {
	readonly name: string;
	readonly context: BrowserContext;
	readonly page: Page;
	/** Every WebSocket frame this phone received, for the visibility assertion. */
	readonly frames: string[];
	readonly tunnel: Tunnel;
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

async function installTunnel(page: Page): Promise<Tunnel> {
	const state = { blocked: false, cut: null as (() => void) | null };

	await page.routeWebSocket(/localhost:4848/, (ws) => {
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

export async function openPhone(
	browser: Browser,
	name: string,
	options: { geolocation?: { longitude: number; latitude: number } } = {},
): Promise<Phone> {
	const context = await browser.newContext({
		permissions: ["geolocation"],
		geolocation: options.geolocation ?? {
			longitude: 13.4132,
			latitude: 52.5219,
		},
	});
	const page = await context.newPage();

	const frames: string[] = [];
	page.on("websocket", (socket) => {
		socket.on("framereceived", (frame) => {
			if (typeof frame.payload === "string") frames.push(frame.payload);
		});
	});

	const tunnel = await installTunnel(page);

	await page.goto("/");
	return {
		name,
		context,
		page,
		frames,
		tunnel,
		close: () => context.close(),
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
