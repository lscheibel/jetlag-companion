import type { ZeroOptions } from "@rocicorp/zero";
import { env } from "@zero-lag/env/web";
import { mutators, schema } from "@zero-lag/schema";
import type { Session } from "../session";

/**
 * Zero accepts writes only while `connected` or `connecting`. Once it decays to
 * `disconnected` a write is rejected outright, and by default that happens
 * after sixty seconds without a connection, or five minutes with the tab
 * hidden — which on a phone means the screen going off.
 *
 * This game is played on the U-Bahn. A hider answering from a platform is the
 * normal case, and a locked phone is the resting state of every device in the
 * game, so both defaults are raised to game scale and Zero is held in
 * `connecting` for as long as a session lasts. Writes queue instead of failing.
 *
 * This runs against Rocicorp's advice, deliberately and for stated reasons —
 * see the offline write contract in m0-spec §3 — and acceptance tests 3 and 7
 * are what settle whether the bet holds.
 */
const GAME_LENGTH_MS = 3 * 60 * 60 * 1000;

export function zeroOptions(session: Session): ZeroOptions {
	return {
		cacheURL: env.VITE_ZERO_CACHE_URL,
		schema,
		mutators,
		userID: session.playerId,
		auth: session.token,
		context: {
			playerId: session.playerId,
			gameId: session.gameId,
			deviceId: session.deviceId,
		},
		kvStore: "idb",
		logLevel: import.meta.env.DEV ? "debug" : "info",
		disconnectTimeoutMs: GAME_LENGTH_MS,
		hiddenTabDisconnectDelay: GAME_LENGTH_MS,
	};
}
