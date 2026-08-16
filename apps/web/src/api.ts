import { env } from "@zero-lag/env/web";
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

async function post<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`${path} failed: ${response.status} ${detail}`);
	}
	return response.json() as Promise<T>;
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
