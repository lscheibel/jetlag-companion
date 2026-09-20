import { Hono } from "hono";
import { contextFromRequest } from "../auth";
import {
	activeTrackingToken,
	ingestPing,
	issueTrackingToken,
	mergeJsonParams,
	parseOsmAndParams,
	parseOverland,
	parseOwnTracks,
	revokeTrackingToken,
	type TrackingIdentity,
} from "../tracking";

/**
 * Two routes with deliberately different front doors. m15-spec §3.
 *
 * `/api/tracking` manages a device's token and is authenticated the ordinary
 * way, with the game token in an `Authorization` header. `/api/track/:token` is
 * the one a tracker app calls, and it authenticates on the path segment alone —
 * because none of these apps can send a header. That is the whole reason the
 * tracking token is a separate, single-verb, revocable secret rather than the
 * game JWT: this URL is going to sit in a third-party app's settings screen and
 * in every proxy log between a player's phone and here.
 */

/**
 * Ages, never timestamps. m0-spec §7.
 *
 * "Last ping 4 seconds ago" is measured here, on the clock that recorded it,
 * and counted up from there by the reader on its own. Handing a phone a server
 * timestamp to subtract from `Date.now()` is the one arithmetic this system
 * does not do anywhere.
 */
function view(identity: TrackingIdentity | null) {
	if (!identity) return null;
	const now = Date.now();
	return {
		token: identity.token,
		createdAgeMs: Math.max(0, now - identity.createdAt),
		lastSeenAgeMs:
			identity.lastSeenAt === null
				? null
				: Math.max(0, now - identity.lastSeenAt),
	};
}

export const tracking = new Hono();

tracking.get("/", async (c) => {
	const context = await contextFromRequest(c.req.raw);
	if (!context) return c.json({ error: "unauthorized" }, 401);

	return c.json({
		tracking: view(await activeTrackingToken(context.deviceId)),
	});
});

/** Issue or rotate. Rotating is the revoke button for a URL already pasted somewhere. */
tracking.post("/", async (c) => {
	const context = await contextFromRequest(c.req.raw);
	if (!context) return c.json({ error: "unauthorized" }, 401);

	return c.json({ tracking: view(await issueTrackingToken(context.deviceId)) });
});

tracking.delete("/", async (c) => {
	const context = await contextFromRequest(c.req.raw);
	if (!context) return c.json({ error: "unauthorized" }, 401);

	await revokeTrackingToken(context.deviceId);
	return c.json({ tracking: null });
});

export const trackIngest = new Hono();

/**
 * Everything a tracker app might do to say "I am here".
 *
 * GET with query parameters is what OsmAnd's online tracking sends; POST with a
 * form body is GPSLogger's default; POST with JSON is OwnTracks, Overland, and
 * the OsmAnd family. All of them land here, and query parameters are merged
 * into the body either way so that a client sending both is not made to choose.
 *
 * **The response body is not a formality.** Overland retries a batch until it
 * is answered `{"result":"ok"}` and OwnTracks wants a JSON array, so answering
 * either one the other's way means a phone re-uploading the same points
 * forever. Which reply goes back is decided by which parser matched, because
 * that is the only thing here that actually knows who is asking.
 */
trackIngest.all("/:token", async (c) => {
	const token = c.req.param("token");

	const params: Record<string, string> = { ...c.req.query() };
	let json: unknown = null;

	if (c.req.method !== "GET" && c.req.method !== "HEAD") {
		const type = c.req.header("content-type") ?? "";
		if (type.includes("json")) {
			json = await c.req.json().catch(() => null);
			mergeJsonParams(params, json);
		} else {
			const form = await c.req.parseBody().catch(() => null);
			for (const [key, value] of Object.entries(form ?? {})) {
				if (typeof value === "string") params[key] = value;
			}
		}
	}

	const overland = parseOverland(json);
	const single = overland
		? null
		: (parseOwnTracks(json) ?? parseOsmAndParams(params));

	const pings = overland ?? (single ? [single] : null);
	if (!pings) return c.json({ error: "no_position" }, 400);

	const result = await ingestPing(token, pings);
	if (!result.ok) {
		/**
		 * A revoked token is 410 and an unknown one is 404, and the difference is
		 * worth the extra branch: a player who rotated their URL and forgot to
		 * update one app gets an answer that names what happened, in whichever log
		 * that app keeps.
		 */
		return c.json(
			{ error: result.reason },
			result.reason === "revoked" ? 410 : 404,
		);
	}

	// Overland retries anything that is not exactly this.
	return overland ? c.json({ result: "ok" }) : c.json([]);
});
