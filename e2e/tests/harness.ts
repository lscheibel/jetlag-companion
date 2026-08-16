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

/** Zero has to be genuinely connected before a test can trust what it reads. */
export async function waitForSync(phone: Phone): Promise<void> {
	await expect(phone.page.getByTestId("connection-state")).toHaveText(
		"connected",
		{ timeout: 30_000 },
	);
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
