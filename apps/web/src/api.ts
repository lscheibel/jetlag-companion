import { z } from "zod";
import { serverUrl } from "./dev-origin";
import { deviceId, type Session } from "./session";

/**
 * The two calls that happen before Zero exists, because Zero needs a token and
 * a token needs a player. Everything after this goes through mutators.
 */

type CreateResponse = {
	gameId: string;
	code: string;
	playerId: string;
	token: string;
};

type JoinResponse = CreateResponse & { rejoined: boolean };

export interface PhotoUpload {
	id: string;
	sha256: string;
	width: number;
	height: number;
}

/**
 * Why a join did not work, in the words the screen will use. m1-spec §7.
 *
 * `removed_from_game` is the only one that is a decision rather than a mistake:
 * a host removed this device, and tapping join again does not undo that.
 */
export type JoinFailure = "no_such_game" | "removed_from_game" | "unknown";

export class JoinError extends Error {
	readonly reason: JoinFailure;

	constructor(reason: JoinFailure, message: string) {
		super(message);
		this.name = "JoinError";
		this.reason = reason;
	}
}

export function joinFailureMessage(reason: JoinFailure): string {
	switch (reason) {
		case "no_such_game":
			return "No game with that code.";
		case "removed_from_game":
			return "You were removed from this game. A host has to let you back in.";
		case "unknown":
			return "That did not work. Try again.";
	}
}

/**
 * What a join code resolves to before anybody has typed a name. m1-spec §8.
 *
 * A game has no title of its own, so what identifies it here is the code plus
 * the two facts that tell you it is the right room: how many people are already
 * waiting in it, and who is running it.
 */
const gamePreview = z.object({
	code: z.string(),
	status: z.enum(["draft", "lobby", "running"]),
	playerCount: z.number(),
	hostName: z.string().nullable(),
});

export type GamePreview = z.infer<typeof gamePreview>;

const errorBody = z.object({ error: z.string() });

async function post<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${serverUrl()}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new JoinError(
			readFailure(detail),
			`${path} failed: ${response.status} ${detail}`,
		);
	}
	return response.json() as Promise<T>;
}

async function get(path: string): Promise<unknown> {
	const response = await fetch(`${serverUrl()}${path}`);
	if (!response.ok) {
		const detail = await response.text();
		throw new JoinError(
			readFailure(detail),
			`${path} failed: ${response.status} ${detail}`,
		);
	}
	return response.json();
}

function readFailure(body: string): JoinFailure {
	const parsed = errorBody.safeParse(safeJson(body));
	if (!parsed.success) return "unknown";
	if (parsed.data.error === "no_such_game") return "no_such_game";
	if (parsed.data.error === "removed_from_game") return "removed_from_game";
	return "unknown";
}

function safeJson(body: string): unknown {
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

export async function fetchGamePreview(code: string): Promise<GamePreview> {
	const body = await get(
		`/api/games/${encodeURIComponent(code.toUpperCase())}`,
	);
	const parsed = gamePreview.safeParse(body);
	if (!parsed.success)
		throw new JoinError("unknown", "unreadable game preview");
	return parsed.data;
}

export async function createGame(displayName: string): Promise<Session> {
	const device = deviceId();
	const result = await post<CreateResponse>("/api/games", {
		displayName,
		deviceId: device,
	});
	return { ...result, deviceId: device };
}

export async function joinGame(
	code: string,
	displayName: string,
): Promise<Session> {
	const device = deviceId();
	const result = await post<JoinResponse>("/api/games/join", {
		code,
		displayName,
		deviceId: device,
	});
	return {
		gameId: result.gameId,
		code: result.code,
		playerId: result.playerId,
		token: result.token,
		deviceId: device,
	};
}

export async function uploadPhoto(
	file: File,
	token: string,
): Promise<PhotoUpload> {
	const form = new FormData();
	form.set("file", file);
	const response = await fetch(`${serverUrl()}/api/photos`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	if (!response.ok) {
		throw new Error(`Photo upload failed: ${response.status}`);
	}
	return response.json() as Promise<PhotoUpload>;
}

export async function fetchPhoto(id: string, token: string): Promise<Blob> {
	const response = await fetch(`${serverUrl()}/api/photos/${id}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		throw new Error(`Photo download failed: ${response.status}`);
	}
	return response.blob();
}

export type DevSceneSummary = {
	id: string;
	group: "lobby" | "hiding" | "seeking";
	label: string;
	hint: string;
};

type SpawnResponse = CreateResponse & { path: string };

const sceneList = z.object({
	scenes: z.array(
		z.object({
			id: z.string(),
			group: z.enum(["lobby", "hiding", "seeking"]),
			label: z.string(),
			hint: z.string(),
		}),
	),
});

export async function listDevScenes(): Promise<DevSceneSummary[]> {
	const parsed = sceneList.safeParse(await get("/api/dev/scenes"));
	if (!parsed.success) throw new Error("unreadable scene list");
	return parsed.data.scenes;
}

export async function spawnDevScene(
	id: string,
): Promise<Session & { path: string }> {
	const device = deviceId();
	const result = await post<SpawnResponse>(`/api/dev/scenes/${id}`, {
		deviceId: device,
	});
	return { ...result, deviceId: device };
}
