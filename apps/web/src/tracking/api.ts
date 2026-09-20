import type { DevicePlatform } from "@zero-lag/platform";
import type { IconName } from "@zero-lag/ui/components/icon";
import { isLoopbackHost, serverUrl } from "../dev-origin";
import type { Session } from "../session";

/**
 * The tracking token, over plain HTTP rather than through Zero. m15-spec §3.
 *
 * Zero's query context is a game and this belongs to a device, which outlives
 * every game it plays. It is also a secret whose entire purpose is to not be
 * the sync bearer, so putting it on the sync stream would be a strange way to
 * keep it off one.
 */

export type TrackingIdentity = {
	readonly token: string;
	/**
	 * Ages rather than timestamps, measured on the server at the moment it
	 * answered. m0-spec §7: a server clock and a phone clock never meet.
	 */
	readonly createdAgeMs: number;
	/** Null until a tracker app has ever reached us — which is the state worth showing. */
	readonly lastSeenAgeMs: number | null;
};

type TrackingResponse = { readonly tracking: TrackingIdentity | null };

async function call(
	session: Session,
	method: "GET" | "POST" | "DELETE",
): Promise<TrackingIdentity | null> {
	const response = await fetch(`${serverUrl()}/api/tracking`, {
		method,
		headers: { Authorization: `Bearer ${session.token}` },
	});
	if (!response.ok) throw new Error(`tracking ${method} ${response.status}`);
	const body = (await response.json()) as TrackingResponse;
	return body.tracking;
}

export function fetchTracking(session: Session) {
	return call(session, "GET");
}

/** Issue, or rotate. Rotating is how a URL already pasted somewhere is taken back. */
export function createTracking(session: Session) {
	return call(session, "POST");
}

export function revokeTracking(session: Session) {
	return call(session, "DELETE");
}

/**
 * The endpoint itself. Correct for a client that builds its own query string,
 * and **not enough on its own** for the two that do not — see below.
 */
export function trackingEndpoint(token: string): string {
	return `${serverUrl()}/api/track/${token}`;
}

/**
 * The apps a player can point at this endpoint, and what each one needs.
 * m15-spec §4, §6.
 *
 * **Every field here is per-app because every field differs per-app**, and the
 * differences are the kind that fail silently:
 *
 * - **The address.** OwnTracks and Overland POST JSON and take the bare
 *   endpoint; OsmAnd substitutes positional `{0}`…`{5}`; GPSLogger substitutes
 *   named `%LAT`-style placeholders. Traccar-family clients take the bare
 *   endpoint and append `lat`/`lon` themselves. Hand any of them the wrong
 *   one and it accepts it, uploads something unreadable, and the player sees
 *   an empty map.
 * - **The platform.** OsmAnd's online tracking is Android-only — the plugin
 *   exists on iOS but that setting does not — and GPSLogger has no iOS build.
 *   Offering either to an iPhone is offering an app that cannot do the job.
 * - **Where it is installed from.** GPSLogger was pulled from the Play Store in
 *   2020 and lives on F-Droid, so a Play link would be a dead end.
 *
 * `%ACC` and `horizontal_accuracy` are accuracies in metres, so GPSLogger and
 * Overland can give the map a real radius; OsmAnd's `hdop` cannot.
 */
export type TrackerApp = {
	readonly id: string;
	readonly name: string;
	/**
	 * What it is, in the words that would make someone pick it — written for a
	 * player choosing an app, not for whoever maintains this list.
	 */
	readonly summary: string;
	/**
	 * The glyph on its door. Here rather than in the screen because a lookup
	 * table keyed by app id in a route file is a fifth app away from being
	 * wrong, and this list is the one place an app is described.
	 */
	readonly glyph: IconName;
	readonly platforms: readonly DevicePlatform[];
	/** Where in that app's own settings the address goes. */
	readonly where: string;
	/**
	 * Where to fetch it, or null when this row is not an app. The Traccar-style
	 * catch-all is a protocol, not a store listing — the player already has
	 * something that talks to a Traccar server.
	 */
	readonly install: string | null;
	/** Named rather than assumed: not every app is on the obvious store. */
	readonly installLabel: string | null;
	/**
	 * What this app needs after the endpoint, or null when it needs nothing.
	 *
	 * Held as data rather than as a function of the token because the query is
	 * the *only* part that differs between apps — the endpoint is common — and
	 * because a plain string can be checked by a test without a browser.
	 */
	readonly query: string | null;
};

/** The address to paste into this app's settings. */
export function trackerAddress(app: TrackerApp, token: string): string {
	const endpoint = trackingEndpoint(token);
	return app.query === null ? endpoint : `${endpoint}?${app.query}`;
}

export const TRACKER_APPS: readonly TrackerApp[] = [
	{
		id: "owntracks",
		glyph: "broadcast",
		name: "OwnTracks",
		summary: "One tap setup.",
		platforms: ["ios", "android"],
		where: "Preferences → Connection → Host",
		install: "https://owntracks.org/booklet/guide/apps/",
		installLabel: "Get OwnTracks",
		query: null,
	},
	{
		id: "overland",
		glyph: "map-pin-area",
		name: "Overland",
		summary: "Lightweight GPS tracker.",
		platforms: ["ios"],
		where: "Settings → Receiver Endpoint URL",
		install: "https://apps.apple.com/app/overland-gps-tracker/id1292426766",
		installLabel: "Get Overland on the App Store",
		query: null,
	},
	{
		id: "osmand",
		glyph: "map-trifold",
		name: "OsmAnd",
		summary: "Via the trip recording plugin.",
		platforms: ["android"],
		where:
			"Plugins → Trip Recording → Settings → Online tracking → Web address",
		install: "https://play.google.com/store/apps/details?id=net.osmand",
		installLabel: "Get OsmAnd on Google Play",
		query: "lat={0}&lon={1}&timestamp={2}&hdop={3}&altitude={4}&speed={5}",
	},
	{
		id: "gpslogger",
		glyph: "broadcast",
		name: "GPSLogger",
		summary: "Lightweight. Installed from F-Droid.",
		platforms: ["android"],
		where: "Logging details → Log to custom URL → URL",
		install: "https://f-droid.org/en/packages/com.mendhak.gpslogger/",
		installLabel: "Get GPSLogger on F-Droid",
		query: "lat=%LAT&lon=%LON&timestamp=%TIME&accuracy=%ACC",
	},
	/**
	 * Last, because it is a protocol not a recommendation. The ingest endpoint
	 * already speaks Traccar's names — GET, form, and JSON — so anything that
	 * can be pointed at a full URL including the path will land. Traccar Client
	 * itself is still unnamed: whether its "Server URL" setting keeps a path
	 * has not been tried on a real device.
	 */
	{
		id: "traccar",
		glyph: "upload-simple",
		name: "Any Traccar-style tracker",
		summary: "If it already talks to a Traccar server.",
		platforms: ["ios", "android"],
		where: "the server URL setting",
		install: null,
		installLabel: null,
		query: null,
	},
];

/**
 * The apps worth showing this phone, best first.
 *
 * An unknown platform gets all of them rather than none: a desktop browser
 * cannot be told which phone is in the player's hand, and a list with two
 * irrelevant entries is a much smaller failure than an empty screen.
 */
export function trackerAppsFor(
	platform: DevicePlatform,
): readonly TrackerApp[] {
	if (platform === "unknown") return TRACKER_APPS;
	return TRACKER_APPS.filter((app) => app.platforms.includes(platform));
}

/**
 * Whether this URL names this computer rather than somewhere a phone can reach.
 *
 * In development `serverUrl()` is the page's own origin, so the URL on screen is
 * whatever the browser is pointed at — and `https://localhost:5173` is the one
 * address that is guaranteed *not* to work, because on the phone running the
 * tracker app, `localhost` is the phone. Worth saying out loud on the screen
 * rather than leaving someone to read it out of a connection-reset log.
 */
export function pointsAtThisComputer(url: string): boolean {
	try {
		return isLoopbackHost(new URL(url).hostname);
	} catch {
		return false;
	}
}

/**
 * OwnTracks configures itself from a link. m15-spec §6.
 *
 * This is the reason OwnTracks is the one recommended by name. Every other app
 * in the family needs a player to type or paste a URL into a settings screen,
 * on a phone, in a station, while four other people wait — and that friction is
 * the most likely reason an optional feature goes unused. OwnTracks reads its
 * whole configuration out of an `owntracks:///config` link, so the same setup is
 * one tap from this screen or one scan from somebody else's.
 *
 * `mode: 3` is HTTP mode: post to `url`, no broker, no account.
 */
export function ownTracksConfigUrl(token: string, playerId: string): string {
	const config = {
		_type: "configuration",
		mode: 3,
		url: trackingEndpoint(token),
		deviceId: playerId,
		// Two characters, shown on OwnTracks' own map. Ours is the only map that
		// matters here, so this only has to be stable, not meaningful.
		tid: playerId.slice(0, 2),
		locatorInterval: 30,
		auth: false,
	};

	const encoded = btoa(JSON.stringify(config));
	return `owntracks:///config?inline=${encodeURIComponent(encoded)}`;
}
