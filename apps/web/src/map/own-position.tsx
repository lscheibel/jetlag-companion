import { circleLngLat } from "@zero-lag/geo";
import type { PositionSnapshot } from "@zero-lag/schema";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { useMemo } from "react";
import { CoordinateCopy } from "./coordinate-copy";
import { multiPolygonFeature } from "./geojson";
import { MapMarker } from "./map-canvas";
import { formatAccuracy } from "./staleness";
import { formatCoordinates } from "./toolkit";
import { useGeoJsonLayer } from "./use-geojson-layer";
import { useMapCamera } from "./use-map-camera";

const ACCURACY_LAYERS = [
	{
		id: "own-accuracy-fill",
		type: "fill" as const,
		paint: { "fill-color": "#0072B2", "fill-opacity": 0.12 },
	},
	{
		id: "own-accuracy-outline",
		type: "line" as const,
		paint: { "line-color": "#0072B2", "line-width": 1, "line-opacity": 0.5 },
	},
];

interface OwnPositionProps {
	readonly fix: PositionSnapshot | null;
	/** Compass degrees, or null where there is no compass. m2-spec §8. */
	readonly headingDeg: number | null;
	readonly onSelect?: () => void;
}

/**
 * Where this phone is. m2-spec §4.
 *
 * Rendered from the local watch and never round-tripped: the device already
 * knows, and asking the server to tell it back adds latency and a failure mode
 * for nothing. This marker and its ring are on screen with the socket down.
 */
export function OwnPosition({ fix, headingDeg, onSelect }: OwnPositionProps) {
	const usable = fix && fix.source !== "unavailable" ? fix : null;
	const { bearing } = useMapCamera();

	const mark = (
		<>
			{headingDeg !== null && (
				<span
					aria-hidden
					className="absolute"
					data-testid="own-heading"
					style={{ transform: `rotate(${headingDeg - bearing}deg)` }}
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
		</>
	);

	return (
		<>
			<AccuracyRing fix={usable} />
			{usable && (
				<MapMarker lat={usable.lat} lng={usable.lng}>
					{onSelect ? (
						<button
							aria-label="Your position"
							className="relative flex size-6 items-center justify-center"
							data-testid="own-marker"
							onClick={onSelect}
							type="button"
						>
							{mark}
						</button>
					) : (
						<div
							className="relative flex size-6 items-center justify-center"
							data-testid="own-marker"
						>
							{mark}
						</div>
					)}
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
	const ring = useMemo(() => {
		if (!fix || fix.accuracyMeters <= 0) return null;
		return circleLngLat([fix.lng, fix.lat], fix.accuracyMeters);
	}, [fix]);
	const data = useMemo(() => multiPolygonFeature(ring), [ring]);
	useGeoJsonLayer("own-accuracy", data, ACCURACY_LAYERS);
	return null;
}

/**
 * Own position as numbers. The cold-offline start has no tiles to draw on, and
 * a hider who wants to know whether they have drifted is served by a coordinate
 * when they cannot be served by a picture. m2-spec §11.
 */
export function OwnPositionReadout({ fix }: { fix: PositionSnapshot | null }) {
	if (!fix || fix.source === "unavailable") return null;
	return (
		<p data-testid="own-readout">
			{formatCoordinates([fix.lng, fix.lat])} ·{" "}
			{formatAccuracy(fix.accuracyMeters)}
		</p>
	);
}

interface OwnPositionSheetProps {
	readonly fix: PositionSnapshot | null;
	readonly open: boolean;
	readonly onClose: () => void;
}

/** Tap your own marker. The numbers live here rather than over the map. */
export function OwnPositionSheet({
	fix,
	open,
	onClose,
}: OwnPositionSheetProps) {
	const shown = useHeldValue(open, fix);

	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="own-position-sheet"
			title="Your position"
		>
			{shown && shown.source !== "unavailable" && (
				<div className="space-y-2 text-sm">
					<OwnPositionReadout fix={shown} />
					<CoordinateCopy
						point={[shown.lng, shown.lat]}
						testId="own-position-coordinates"
					/>
				</div>
			)}
		</Sheet>
	);
}
