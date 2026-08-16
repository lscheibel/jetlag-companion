import { env } from "@zero-lag/env/server";
import type { GameContext, GameToken } from "@zero-lag/schema";
import { jwtVerify, SignJWT } from "jose";

/**
 * The token identifies a player and scopes them to one game. That scoping *is*
 * load-bearing — a bad actor's blast radius must be exactly the game they were
 * invited to — but within a game we do not defend against dev tools. m0-spec §4.
 *
 * Role is deliberately absent. It belongs to the round and is resolved by
 * joining `player → teamMember → team → roundTeamRole` at read time.
 */

const secret = new TextEncoder().encode(env.GAME_TOKEN_SECRET);

/** Long, because a person should be able to come back to a finished game. */
const TOKEN_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

export async function issueGameToken(input: {
	playerId: string;
	gameId: string;
	deviceId: string;
}): Promise<string> {
	return new SignJWT({ gameId: input.gameId, deviceId: input.deviceId })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(input.playerId)
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
		.sign(secret);
}

export async function verifyGameToken(token: string): Promise<GameToken> {
	const { payload } = await jwtVerify(token, secret);
	const { sub, gameId, deviceId, iat, exp } = payload;
	if (
		typeof sub !== "string" ||
		typeof gameId !== "string" ||
		typeof deviceId !== "string" ||
		typeof iat !== "number" ||
		typeof exp !== "number"
	) {
		throw new Error("malformed game token");
	}
	return { sub, gameId, deviceId, iat, exp };
}

export function bearerFrom(headers: Headers): string | null {
	const header = headers.get("Authorization") ?? headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = header.slice("Bearer ".length).trim();
	return token.length > 0 ? token : null;
}

/**
 * Resolves the context Zero's query and mutator handlers receive.
 *
 * Returns null rather than throwing, so an unauthenticated request produces a
 * 401 — which is what puts Zero into `needs-auth` and prompts the client to
 * refresh — rather than a 500, which would put it into `error` and stop it
 * retrying at all.
 */
export async function contextFromRequest(
	request: Request,
): Promise<GameContext | null> {
	const token = bearerFrom(request.headers);
	if (!token) return null;
	try {
		const claims = await verifyGameToken(token);
		return {
			playerId: claims.sub,
			gameId: claims.gameId,
			deviceId: claims.deviceId,
		};
	} catch {
		return null;
	}
}
