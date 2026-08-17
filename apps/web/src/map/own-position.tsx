import { circleLngLat } from "@zero-lag/geo";
import type { PositionSnapshot } from "@zero-lag/schema";
import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { EMPTY_FEATURES, multiPolygonFeature } from "./geojson";
import { MapMarker, useMapInstance } from "./map-canvas";
import { formatAccuracy } from "./staleness";

const SOURCE_ID = "own-accuracy";
const LAYER_ID = "own-accuracy-fill";
const OUTLINE_ID = "own-accuracy-outline";

interface OwnPositionProps {
	readonly fix: PositionSnapshot | null;
	/** Compass degrees, or null where there is no compass. m2-spec §8. */
	readonly headingDeg: number | null;
}

/**
 * Where this phone is. m2-spec §4.
 *
 * Rendered from the local watch and never round-tripped: the device already
 * knows, and asking the server to tell it back adds latency and a failure mode
 * for nothing. This marker and its ring are on screen with the socket down.
 */
export function OwnPosition({ fix, headingDeg }: OwnPositionProps) {
	const usable = fix && fix.source !== "unavailable" ? fix : null;

	return (
		<>
			<AccuracyRing fix={usable} />
			{usable && (
				<MapMarker lat={usable.lat} lng={usable.lng}>
					<div
						className="relative flex size-6 items-center justify-center"
						data-testid="own-marker"
					>
						{headingDeg !== null && (
							<span
								aria-hidden
								className="absolute"
								data-testid="own-heading"
								style={{ transform: `rotate(${headingDeg}deg)` }}
							>
								<svg
									aria-hidden
									height="34"
									viewBox="0 0 24 34"
									width="24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<title>Facing</title>
									<path d="M12 0 L17 11 L12 8.5 L7 11 Z" fill="#0072B2" />
								</svg>
							</span>
						)}
						<span className="size-4 rounded-full border-2 border-white bg-[#0072B2] shadow" />
					</div>
				</MapMarker>
			)}
		</>
	);
}

/**
 * The one accuracy ring. m2-spec §5.
 *
 * It earns its place around the phone in your hand — the difference between "I
 * am at this exit" and "I am somewhere in this square" — and nowhere else.
 * Everybody else's accuracy is six characters of text next to their name,
 * because four overlapping washes read as noise and a 1.5km network fix would
 * swamp a district with a circle nobody can act on.
 *
 * The vertices come from `packages/geo`'s circle, the same one radar uses. Two
 * implementations of one idea drift, and the symptom shows up as a geometry bug
 * long before anyone suspects duplication. m0-spec §9.
 */
function AccuracyRing({ fix }: { fix: PositionSnapshot | null }) {
	const map = useMapInstance();

	const ring = useMemo(() => {
		if (!fix || fix.accuracyMeters <= 0) return null;
		return circleLngLat([fix.lng, fix.lat], fix.accuracyMeters);
	}, [fix]);

	useEffect(() => {
		if (!map) return;

		map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_FEATURES });
		map.addLayer({
			id: LAYER_ID,
			type: "fill",
			source: SOURCE_ID,
			paint: { "fill-color": "#0072B2", "fill-opacity": 0.12 },
		});
		map.addLayer({
			id: OUTLINE_ID,
			type: "line",
			source: SOURCE_ID,
			paint: { "line-color": "#0072B2", "line-width": 1, "line-opacity": 0.5 },
		});

		return () => {
			if (map.getLayer(OUTLINE_ID)) map.removeLayer(OUTLINE_ID);
			if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
			if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
		};
	}, [map]);

	useEffect(() => {
		map
			?.getSource<GeoJSONSource>(SOURCE_ID)
			?.setData(multiPolygonFeature(ring));
	}, [map, ring]);

	return null;
}

/**
 * Own position as numbers. The cold-offline start has no tiles to draw on, and
 * a hider who wants to know whether they have drifted is served by a coordinate
 * when they cannot be served by a picture. m2-spec §11.
 */
export function OwnPositionReadout({ fix }: { fix: PositionSnapshot | null }) {
	if (!fix || fix.source === "unavailable") {
		return <p data-testid="own-readout">No fix from this device yet.</p>;
	}
	return (
		<p data-testid="own-readout">
			{fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} ·{" "}
			{formatAccuracy(fix.accuracyMeters)}
		</p>
	);
}
