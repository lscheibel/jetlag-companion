/**
 * The wire formats the tracker apps speak. m15-spec §4.
 *
 * Parsing is kept apart from delivery so that it can be read — and tested —
 * without a database. Everything here is a pure function over what a client
 * sent; `tracking.ts` is what turns a parsed ping into rows and broadcasts.
 */

export type ParsedPing = {
	readonly lng: number;
	readonly lat: number;
	readonly accuracyMeters: number | null;
	readonly speedMps: number | null;
	readonly capturedAt: number;
};

function firstNumber(
	params: Record<string, string>,
	...names: string[]
): number | null {
	for (const name of names) {
		const raw = params[name];
		if (raw === undefined || raw === "") continue;
		const value = Number(raw);
		if (Number.isFinite(value)) return value;
	}
	return null;
}

/**
 * Epoch seconds, epoch milliseconds, ISO-8601, or `yyyy-MM-dd HH:mm:ss`.
 *
 * All four are in circulation across the apps that speak this protocol, and
 * Traccar's server accepts all four, so a client configured against Traccar and
 * then re-pointed here must not start failing over a date format.
 *
 * The seconds-or-milliseconds split is by magnitude: `1e11` milliseconds is
 * 1973 and `1e11` seconds is the year 5138, so nothing plausible is ambiguous.
 */
function parseTimestamp(raw: string | undefined): number | null {
	if (!raw) return null;

	const numeric = Number(raw);
	if (Number.isFinite(numeric) && numeric > 0) {
		return numeric > 1e11 ? numeric : numeric * 1_000;
	}

	// A space-separated stamp carries no zone and Traccar reads it as UTC.
	const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The OsmAnd protocol family, as sent by OsmAnd, Traccar Client and GPSLogger.
 *
 * It is a de-facto family rather than a standard, and the asymmetry is what
 * makes one handler cover all of them: OsmAnd and GPSLogger let the *player*
 * write the whole URL, so they can be made to send anything, while Traccar
 * Client sends a fixed set of names. Accepting Traccar's names plus the obvious
 * aliases therefore covers the lot, and unknown parameters are ignored rather
 * than rejected — exactly as Traccar's own server does, so a URL that worked
 * there works here.
 *
 * **`hdop` is not accuracy.** It is a unitless dilution of precision describing
 * satellite geometry, and there is no conversion to metres. A fix that carries
 * only `hdop` gets `accuracyMeters: null`, which the UI renders by saying
 * nothing rather than by inventing a radius.
 *
 * **Heading is dropped on purpose.** What these apps send is course over
 * ground, and m2-spec §8 is explicit that heading is the compass or it is
 * nothing — no course-over-ground fallback.
 */
export function parseOsmAndParams(
	params: Record<string, string>,
): ParsedPing | null {
	const lat = firstNumber(params, "lat", "latitude");
	const lng = firstNumber(params, "lon", "lng", "longitude");
	if (lat === null || lng === null) return null;
	if (!inBounds(lat, lng)) return null;

	return {
		lat,
		lng,
		accuracyMeters: firstNumber(params, "accuracy", "acc"),
		/**
		 * Metres per second, which is what OsmAnd itself sends. Traccar's decoder
		 * reads this field as knots for some hardware trackers; between the two
		 * readings this one belongs to the app whose URL template we document, and
		 * speed is displayed rather than acted on.
		 */
		speedMps: firstNumber(params, "speed"),
		capturedAt: parseTimestamp(params.timestamp) ?? Date.now(),
	};
}

/**
 * OwnTracks' own JSON, which is worth handling separately for one reason:
 * `acc` is an accuracy in **metres**, where the OsmAnd family offers only
 * `hdop`. It is the only client of the four that can populate the radius the
 * map already knows how to draw.
 */
export function parseOwnTracks(body: unknown): ParsedPing | null {
	if (typeof body !== "object" || body === null) return null;
	const record: Record<string, unknown> = { ...body };
	if (record._type !== "location") return null;

	const lat = numberOrNull(record.lat);
	const lng = numberOrNull(record.lon);
	if (lat === null || lng === null || !inBounds(lat, lng)) return null;

	const tst = numberOrNull(record.tst);
	const velocity = numberOrNull(record.vel);

	return {
		lat,
		lng,
		accuracyMeters: numberOrNull(record.acc),
		// `vel` is km/h, integer. Everything downstream is m/s.
		speedMps: velocity === null ? null : (velocity * 1_000) / 3_600,
		capturedAt: tst === null ? Date.now() : tst * 1_000,
	};
}

/**
 * Overland, which is the only one of these that batches. m15-spec §4.
 *
 * It POSTs `{ locations: [GeoJSON Feature, …] }` — up to two hundred points at
 * a time by default — because it is built to survive a day with no signal and
 * then hand over everything at once. Every point is kept: dropping all but the
 * newest would be throwing away exactly the trail the durable log exists to
 * replay, and a batch arriving after a tunnel is the case this whole feature
 * is for.
 *
 * Coordinates are GeoJSON order, `[lon, lat]`. `horizontal_accuracy` is metres
 * and `speed` is metres per second, both already the units we store.
 */
export function parseOverland(body: unknown): ParsedPing[] | null {
	if (typeof body !== "object" || body === null) return null;
	const locations = (body as { locations?: unknown }).locations;
	if (!Array.isArray(locations)) return null;

	const pings: ParsedPing[] = [];
	for (const entry of locations) {
		const ping = parseOverlandFeature(entry);
		if (ping) pings.push(ping);
	}

	// An empty batch is a well-formed request Overland genuinely sends; it is not
	// a parse failure, and answering it with a 400 would make the app retry it.
	return pings;
}

function parseOverlandFeature(entry: unknown): ParsedPing | null {
	if (typeof entry !== "object" || entry === null) return null;
	const feature = entry as {
		geometry?: { coordinates?: unknown };
		properties?: Record<string, unknown>;
	};

	const coordinates = feature.geometry?.coordinates;
	if (!Array.isArray(coordinates)) return null;

	// GeoJSON is [lng, lat]. Getting this the wrong way round puts every player
	// in the ocean off West Africa, which is at least an obvious failure.
	const lng = numberOrNull(coordinates[0]);
	const lat = numberOrNull(coordinates[1]);
	if (lat === null || lng === null || !inBounds(lat, lng)) return null;

	const properties = feature.properties ?? {};
	const timestamp = properties.timestamp;

	return {
		lat,
		lng,
		accuracyMeters: numberOrNull(properties.horizontal_accuracy),
		speedMps: numberOrNull(properties.speed),
		capturedAt:
			(typeof timestamp === "string" ? parseTimestamp(timestamp) : null) ??
			Date.now(),
	};
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inBounds(lat: number, lng: number): boolean {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Flatten a JSON object onto the OsmAnd-family parameter map. m15-spec §4.
 *
 * GET query, POST form, and POST JSON all land in `parseOsmAndParams`. OwnTracks
 * and Overland keep the raw body for their own parsers; this is for the
 * Traccar-shaped JSON that has no `_type` and no `locations` array. Numbers
 * become strings so the parser that already reads query parameters can read
 * them unchanged.
 *
 * Body wins on a name clash, matching how a form body already overwrites the
 * query string.
 */
export function mergeJsonParams(
	params: Record<string, string>,
	json: unknown,
): void {
	if (typeof json !== "object" || json === null || Array.isArray(json)) return;
	for (const [key, value] of Object.entries(json)) {
		if (typeof value === "string") params[key] = value;
		else if (typeof value === "number" && Number.isFinite(value)) {
			params[key] = String(value);
		}
	}
}
