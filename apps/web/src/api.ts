import { env } from "@zero-lag/env/web";
import { z } from "zod";
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

const errorBody = z.object({ error: z.string() });

async function post<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
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
