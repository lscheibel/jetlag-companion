import { multiPolygonToRegion, regionContains } from "@zero-lag/geo";
import { describe, expect, it } from "vitest";
import { parseAreaFile } from "./import-file";

const BOX = {
	type: "Polygon",
	coordinates: [
		[
			[13.4, 52.5],
			[13.5, 52.5],
			[13.5, 52.55],
			[13.4, 52.55],
			[13.4, 52.5],
		],
	],
};

describe("parseAreaFile", () => {
	it("reads a GeoJSON polygon", () => {
		const result = parseAreaFile(
			"mitte.geojson",
			JSON.stringify({ type: "Feature", properties: {}, geometry: BOX }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("mitte");
		expect(
			regionContains(multiPolygonToRegion(result.geometry), [13.45, 52.52]),
		).toBe(true);
	});

	it("reads KML coordinates", () => {
		const kml = `<?xml version="1.0"?>
<kml><Document><Placemark><Polygon><outerBoundaryIs><LinearRing>
<coordinates>
13.4,52.5,0 13.5,52.5,0 13.5,52.55,0 13.4,52.55,0 13.4,52.5,0
</coordinates>
</LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
		const result = parseAreaFile("run.kml", kml);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("run");
		expect(
			regionContains(multiPolygonToRegion(result.geometry), [13.45, 52.52]),
		).toBe(true);
	});

	it("reads a closed GPX track and ignores an open one", () => {
		const closed = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="52.5" lon="13.4"/><trkpt lat="52.5" lon="13.5"/>
<trkpt lat="52.55" lon="13.5"/><trkpt lat="52.55" lon="13.4"/>
<trkpt lat="52.5" lon="13.4"/>
</trkseg></trk></gpx>`;
		const open = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="52.5" lon="13.4"/><trkpt lat="52.5" lon="13.5"/>
<trkpt lat="52.55" lon="13.5"/>
</trkseg></trk></gpx>`;
		const ok = parseAreaFile("loop.gpx", closed);
		expect(ok.ok).toBe(true);
		const skip = parseAreaFile("trace.gpx", open);
		expect(skip.ok).toBe(false);
	});

	it("rejects a pin", () => {
		const result = parseAreaFile(
			"pin.geojson",
			JSON.stringify({
				type: "Feature",
				geometry: { type: "Point", coordinates: [13.4, 52.5] },
			}),
		);
		expect(result.ok).toBe(false);
	});
});
