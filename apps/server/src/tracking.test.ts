import { describe, expect, it } from "vitest";
import {
	mergeJsonParams,
	parseOsmAndParams,
	parseOverland,
	parseOwnTracks,
} from "./tracking-protocol";

/**
 * The protocol surface, which is where this feature's bugs would live. m15-spec §4.
 *
 * These apps are configured by a player pasting a URL into a settings screen and
 * then walking out of the door, so a parsing mistake is discovered hours later
 * as a marker that never moved. Every format below is one a real client sends.
 */

const BERLIN = { lat: "52.52", lon: "13.405" };

describe("the OsmAnd protocol family", () => {
	it("reads OsmAnd's own template", () => {
		const ping = parseOsmAndParams({
			lat: "52.52",
			lon: "13.405",
			timestamp: "1757160000000",
			hdop: "1.4",
			altitude: "34",
			speed: "3.5",
		});

		expect(ping).toMatchObject({
			lat: 52.52,
			lng: 13.405,
			speedMps: 3.5,
			capturedAt: 1_757_160_000_000,
		});
	});

	it("refuses to turn hdop into a radius", () => {
		const ping = parseOsmAndParams({ ...BERLIN, hdop: "1.4" });

		// hdop is satellite geometry, not metres, and there is no conversion.
		expect(ping?.accuracyMeters).toBeNull();
	});

	it("takes accuracy when a client actually sends metres", () => {
		expect(
			parseOsmAndParams({ ...BERLIN, accuracy: "12.5" })?.accuracyMeters,
		).toBe(12.5);
	});

	it("accepts Traccar Client's fixed parameter names", () => {
		const ping = parseOsmAndParams({
			id: "863071016800770",
			lat: "52.52",
			lon: "13.405",
			timestamp: "1757160000",
			speed: "0.72",
			altitude: "433.10",
			hdop: "81",
			batt: "11.43",
		});

		expect(ping).toMatchObject({ lat: 52.52, lng: 13.405, speedMps: 0.72 });
	});

	it("accepts latitude/longitude spelled out", () => {
		expect(
			parseOsmAndParams({ latitude: "52.52", longitude: "13.405" }),
		).toMatchObject({ lat: 52.52, lng: 13.405 });
	});

	it("ignores parameters it does not know", () => {
		expect(
			parseOsmAndParams({ ...BERLIN, sat: "11", somethingElse: "x" }),
		).toMatchObject({ lat: 52.52 });
	});

	it("is nothing without a position", () => {
		expect(parseOsmAndParams({ timestamp: "1757160000" })).toBeNull();
		expect(parseOsmAndParams({ lat: "52.52" })).toBeNull();
	});

	it("rejects coordinates off the planet", () => {
		expect(parseOsmAndParams({ lat: "952.52", lon: "13.405" })).toBeNull();
		expect(parseOsmAndParams({ lat: "52.52", lon: "913.405" })).toBeNull();
	});

	describe("timestamps, all four spellings Traccar accepts", () => {
		const expected = Date.UTC(2025, 8, 6, 12, 0, 0);

		it("reads epoch seconds", () => {
			expect(
				parseOsmAndParams({ ...BERLIN, timestamp: String(expected / 1000) })
					?.capturedAt,
			).toBe(expected);
		});

		it("reads epoch milliseconds", () => {
			expect(
				parseOsmAndParams({ ...BERLIN, timestamp: String(expected) })
					?.capturedAt,
			).toBe(expected);
		});

		it("reads ISO-8601", () => {
			expect(
				parseOsmAndParams({ ...BERLIN, timestamp: "2025-09-06T12:00:00Z" })
					?.capturedAt,
			).toBe(expected);
		});

		it("reads a space-separated stamp as UTC", () => {
			expect(
				parseOsmAndParams({ ...BERLIN, timestamp: "2025-09-06 12:00:00" })
					?.capturedAt,
			).toBe(expected);
		});

		it("falls back to arrival rather than to 1970", () => {
			const before = Date.now();
			const ping = parseOsmAndParams({ ...BERLIN, timestamp: "not a date" });
			expect(ping?.capturedAt).toBeGreaterThanOrEqual(before);
		});
	});
});

describe("OwnTracks", () => {
	const location = {
		_type: "location",
		lat: 52.52,
		lon: 13.405,
		tst: 1_757_160_000,
		acc: 12,
		alt: 34,
		vel: 36,
		batt: 82,
	};

	it("reads a location report", () => {
		expect(parseOwnTracks(location)).toEqual({
			lat: 52.52,
			lng: 13.405,
			accuracyMeters: 12,
			speedMps: 10,
			capturedAt: 1_757_160_000_000,
		});
	});

	it("is the only client that can give the map a real accuracy radius", () => {
		expect(parseOwnTracks(location)?.accuracyMeters).toBe(12);
	});

	it("converts velocity from km/h", () => {
		expect(parseOwnTracks({ ...location, vel: 36 })?.speedMps).toBe(10);
	});

	it("ignores everything that is not a location report", () => {
		expect(parseOwnTracks({ ...location, _type: "transition" })).toBeNull();
		expect(parseOwnTracks({ _type: "location" })).toBeNull();
		expect(parseOwnTracks(null)).toBeNull();
		expect(parseOwnTracks("location")).toBeNull();
	});
});

describe("Overland", () => {
	const feature = (
		lon: number,
		lat: number,
		timestamp: string,
		extra: Record<string, unknown> = {},
	) => ({
		type: "Feature",
		geometry: { type: "Point", coordinates: [lon, lat] },
		properties: { timestamp, ...extra },
	});

	it("reads a batch and keeps every point", () => {
		const pings = parseOverland({
			locations: [
				feature(13.405, 52.52, "2025-09-06T12:00:00Z"),
				feature(13.41, 52.53, "2025-09-06T12:00:30Z"),
				feature(13.415, 52.54, "2025-09-06T12:01:00Z"),
			],
		});

		// The whole batch, because the batch *is* the trail — an Overland upload
		// after a tunnel is the case the durable log most wants.
		expect(pings).toHaveLength(3);
		expect(pings?.[0]).toMatchObject({ lat: 52.52, lng: 13.405 });
	});

	it("reads GeoJSON coordinates as [lng, lat], not the other way round", () => {
		const [ping] = parseOverland({
			locations: [feature(13.405, 52.52, "2025-09-06T12:00:00Z")],
		}) as NonNullable<ReturnType<typeof parseOverland>>;

		expect(ping).toMatchObject({ lng: 13.405, lat: 52.52 });
	});

	it("takes horizontal_accuracy as metres and speed as m/s", () => {
		const [ping] = parseOverland({
			locations: [
				feature(13.405, 52.52, "2025-09-06T12:00:00Z", {
					horizontal_accuracy: 14,
					speed: 3.5,
					altitude: 34,
				}),
			],
		}) as NonNullable<ReturnType<typeof parseOverland>>;

		expect(ping).toMatchObject({ accuracyMeters: 14, speedMps: 3.5 });
	});

	it("skips malformed features rather than losing the batch", () => {
		const pings = parseOverland({
			locations: [
				feature(13.405, 52.52, "2025-09-06T12:00:00Z"),
				{ type: "Feature", geometry: null, properties: {} },
				{ nonsense: true },
			],
		});

		expect(pings).toHaveLength(1);
	});

	it("accepts an empty batch, which Overland genuinely sends", () => {
		// Answering this 400 would make the app retry a request that was fine.
		expect(parseOverland({ locations: [] })).toEqual([]);
	});

	it("is nothing when the body is not an Overland upload", () => {
		expect(
			parseOverland({ _type: "location", lat: 52.52, lon: 13.405 }),
		).toBeNull();
		expect(parseOverland(null)).toBeNull();
		expect(parseOverland({ locations: "nope" })).toBeNull();
	});
});

describe("JSON flattened onto the OsmAnd parameter map", () => {
	it("lets a Traccar-shaped JSON body parse as OsmAnd", () => {
		const params: Record<string, string> = {};
		mergeJsonParams(params, {
			lat: 52.52,
			lon: 13.405,
			timestamp: 1_757_160_000,
			speed: 0.72,
		});

		expect(parseOsmAndParams(params)).toMatchObject({
			lat: 52.52,
			lng: 13.405,
			speedMps: 0.72,
			capturedAt: 1_757_160_000_000,
		});
	});

	it("reads numeric and string values, and skips nested objects", () => {
		const params: Record<string, string> = {};
		mergeJsonParams(params, {
			lat: "52.52",
			lon: 13.405,
			nested: { no: "thanks" },
			ok: true,
		});

		expect(params).toEqual({ lat: "52.52", lon: "13.405" });
	});

	it("lets the body win a name clash, matching a form overwrite", () => {
		const params: Record<string, string> = { lat: "1", lon: "2" };
		mergeJsonParams(params, { lat: 52.52 });
		expect(params.lat).toBe("52.52");
		expect(params.lon).toBe("2");
	});

	it("ignores arrays and null, which belong to Overland or to a bad body", () => {
		const params: Record<string, string> = { lat: "52.52" };
		mergeJsonParams(params, [{ lat: 1 }]);
		mergeJsonParams(params, null);
		expect(params).toEqual({ lat: "52.52" });
	});
});
