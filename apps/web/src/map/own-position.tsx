import { circleLngLat } from "@zero-lag/geo";
import type { PositionSnapshot } from "@zero-lag/schema";
import type { GeoJSONSource } from "maplibre-gl";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import type { FeatureData } from "./geojson";
import {
	EMPTY_FEATURES,
	multiPolygonFeature,
	multiPolygonOutlines,
} from "./geojson";
import { MapMarker, useMapInstance } from "./map-canvas";
import { formatAccuracy } from "./staleness";
import { formatCoordinates } from "./toolkit";
import type { MapLayerSpec } from "./use-geojson-layer";
import { useGeoJsonLayer } from "./use-geojson-layer";
import { useMapCamera } from "./use-map-camera";

interface OwnPositionProps {
	readonly fix: PositionSnapshot | null;
	/** Compass degrees, or null where there is no compass. m2-spec §8. */
	readonly headingDeg: number | null;
	/** Your team's colour, or the no-team grey. */
	readonly color: string;
	readonly onSelect?: () => void;
}

/**
 * Where this phone is. m2-spec §4.
 *
 * Rendered from the local watch and never round-tripped: the device already
 * knows, and asking the server to tell it back adds latency and a failure mode
 * for nothing. This marker and its ring are on screen with the socket down.
 *
 * Everything here is drawn in the team's colour. It used to be cobalt, hard-
 * coded in three places — which is `team-cobalt` from `packages/schema`'s
 * identity set, so on a board with a Cobalt team you and they were the same
 * colour and nobody had said so on purpose. You are told apart from a teammate
 * by being a different object, not a different hue: a bare rimmed dot with a
 * chevron over it, where they are a badge carrying an emoji and an initial.
 */
export function OwnPosition({
	fix,
	headingDeg,
	color,
	onSelect,
}: OwnPositionProps) {
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
					<HeadingChevron color={color} />
				</span>
			)}
			{/*
			 * Positioned, so that it paints after the chevron rather than under it.
			 * An absolutely positioned sibling paints above in-flow content whatever
			 * the source order says, and the chevron's base was landing on top of
			 * the white rim — the one edge that keeps the dot legible against a
			 * saturated basemap. Behind it, the rim closes and the chevron reads as
			 * a wedge coming out from under the dot.
			 */}
			<span
				className="relative size-4 rounded-full border-2 border-white shadow"
				style={{ backgroundColor: color }}
			/>
		</>
	);

	return (
		<>
			<AccuracyRing color={color} fix={usable} />
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
 * Which way you are facing, as a rounded chevron. Deck 15's softening study.
 *
 * The shape it replaces was a five-point arrowhead with a notch cut out of its
 * base, filled flat — four hard corners on a mark 16 px across, which at that
 * size reads as a blade stabbing the map and claims a degree of precision a
 * phone compass does not have. This is the same bearing drawn with a fat round
 * join: the stroke is the same colour as the fill, so widening it inflates the
 * body rather than outlining it, and the chubbiness is that stroke.
 *
 * It stands off the dot rather than growing out of it. Once the dot paints over
 * the chevron's base, a shape that starts under the rim reads as one object with
 * a bulge on one side; a clear 2 px of map between them makes it two — a dot
 * that is where you are, and a mark beside it that is which way you point.
 * Standing it off costs room, so the body shrinks to 85% to pay for it and the
 * whole mark still ends well inside where it used to.
 *
 * The viewBox is deliberately tall and the shape sits in its upper half: the
 * span is centred on the fix and rotated, so the geometric centre of this box is
 * the pivot, and the distance from that centre to the shape is the stand-off.
 */
function HeadingChevron({ color }: { color: string }) {
	return (
		<svg
			aria-hidden
			height="44"
			viewBox="0 0 24 44"
			width="24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Facing</title>
			<path
				d="M12 3.3 L15.9 10.3 Q12 8.5 8.1 10.3 Z"
				fill={color}
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="3.4"
			/>
		</svg>
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
 * It is a wash and nothing else. The hairline that used to draw its edge stated
 * a boundary the number does not have: the true position is somewhere in here
 * with no particular probability of being just inside rather than just outside,
 * and a crisp line says otherwise. What marks the edge now is the pulse
 * arriving at it, which is a moment rather than a fact.
 *
 * The vertices come from `packages/geo`'s circle, the same one radar uses. Two
 * implementations of one idea drift, and the symptom shows up as a geometry bug
 * long before anyone suspects duplication. m0-spec §9.
 */
function AccuracyRing({
	fix,
	color,
}: {
	fix: PositionSnapshot | null;
	color: string;
}) {
	const ring = useMemo(() => {
		const radius = fix?.accuracyMeters ?? 0;
		if (!fix || radius <= 0) return null;
		return circleLngLat([fix.lng, fix.lat], radius);
	}, [fix]);
	const data = useMemo(() => multiPolygonFeature(ring), [ring]);
	const layers = useMemo<readonly MapLayerSpec[]>(
		() => [
			{
				id: "own-accuracy-fill",
				type: "fill",
				paint: { "fill-color": color, "fill-opacity": 0.12 },
			},
		],
		[color],
	);
	useGeoJsonLayer("own-accuracy", data, layers);
	return <AccuracyPulse color={color} fix={fix} />;
}

const PULSE_LAYER = "own-pulse";
/** Centre to edge. Slow enough to read as travel rather than as a flash. */
const PULSE_TRAVEL_MS = 1_400;
/** Then nothing, so the map is still most of the time. */
const PULSE_REST_MS = 2_800;
/**
 * Faint. It is a sign of life, not a thing to look at — and it holds most of
 * that most of the way out, spending the fade on the last third, where a ring
 * that simply stopped would read as one that had hit something.
 */
const PULSE_PEAK_OPACITY = 0.5;
const PULSE_WIDTH_PX = 2;
/** 30 fps. Sixty would be twice the re-tiling for motion nobody can see. */
const PULSE_FRAME_MS = 33;

/** Fast out of the centre, easing into the edge. */
function easeOut(progress: number): number {
	return 1 - (1 - progress) ** 3;
}

/**
 * One ring leaving the fix and reaching the edge of the accuracy circle, every
 * few seconds. m2-spec §5.
 *
 * Its job is to say the marker is live — that this is a position still being
 * taken, not the last one before the watch died — which is the one thing a
 * static dot cannot say about itself. It ends exactly on the accuracy radius,
 * so the pulse is also what draws that edge now that the hairline is gone.
 *
 * It is ground geometry rather than a screen-space circle, because the thing it
 * has to arrive at is ground geometry. `circle-pitch-alignment: map` looks like
 * the cheap way to do this — one animated radius, no vertices — but the radius
 * it takes is in tile units rather than pixels, and the viewport alignment that
 * does take pixels stays a flat disc while the wash beneath it foreshortens
 * into an ellipse. At 60° of pitch the ring is then nowhere near the edge it is
 * supposed to be landing on. Re-cutting the circle costs a `setData` a frame;
 * being in the wrong place costs the whole idea.
 *
 * The vertices come from the same `circleLngLat` the wash does, so the pulse
 * cannot arrive anywhere but exactly on it. m0-spec §9.
 *
 * The frame budget is spent deliberately: 30 fps rather than 60, a rest between
 * pulses rather than a loop that spins all round, and nothing at all under
 * reduced motion — this is running on a phone that is also holding a socket
 * open and a GPS watch on.
 */
function AccuracyPulse({
	fix,
	color,
}: {
	fix: PositionSnapshot | null;
	color: string;
}) {
	const map = useMapInstance();
	const reduced = useReducedMotion();

	const layers = useMemo<readonly MapLayerSpec[]>(
		() => [
			{
				id: PULSE_LAYER,
				type: "line",
				layout: { "line-cap": "round", "line-join": "round" },
				paint: {
					"line-color": color,
					"line-width": PULSE_WIDTH_PX,
					"line-opacity": 0,
				},
			},
		],
		[color],
	);
	/**
	 * The source opens empty and stays the loop's to write. Handing the hook a
	 * ring as well would mean two writers on one source, one of them re-sending
	 * the last frame of the previous pulse every time a fix lands.
	 */
	useGeoJsonLayer(PULSE_LAYER, EMPTY_FEATURES, layers);

	/**
	 * The fix the running loop should read, rather than the one it started with.
	 * A new position arrives every few seconds; restarting the cycle on each one
	 * would mean the pulse never finishes crossing while the phone is moving.
	 */
	const current = useRef({ lng: 0, lat: 0, radiusMeters: 0 });
	current.current = {
		lng: fix?.lng ?? 0,
		lat: fix?.lat ?? 0,
		radiusMeters: fix?.accuracyMeters ?? 0,
	};

	// Null for every external tracker — OsmAnd reports HDOP, not metres — so
	// there is no circle to cross and nothing to pulse.
	const running = (fix?.accuracyMeters ?? 0) > 0;

	useEffect(() => {
		if (!map || !running || reduced) return;

		const draw = (data: FeatureData, opacity: number) => {
			map.getSource<GeoJSONSource>(PULSE_LAYER)?.setData(data);
			if (map.getLayer(PULSE_LAYER)) {
				map.setPaintProperty(PULSE_LAYER, "line-opacity", opacity);
			}
		};

		let frame = 0;
		let timer = 0;
		let startedAt = 0;
		let drawnAt = 0;

		const step = (now: number) => {
			if (startedAt === 0) startedAt = now;
			const progress = Math.min(1, (now - startedAt) / PULSE_TRAVEL_MS);

			if (progress === 1 || now - drawnAt >= PULSE_FRAME_MS) {
				drawnAt = now;
				const { lng, lat, radiusMeters } = current.current;
				const ring = circleLngLat([lng, lat], radiusMeters * easeOut(progress));
				draw(
					multiPolygonOutlines(ring),
					PULSE_PEAK_OPACITY * (1 - progress ** 2),
				);
			}

			if (progress < 1) {
				frame = requestAnimationFrame(step);
				return;
			}
			draw(EMPTY_FEATURES, 0);
			startedAt = 0;
			timer = window.setTimeout(() => {
				frame = requestAnimationFrame(step);
			}, PULSE_REST_MS);
		};

		frame = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(timer);
			draw(EMPTY_FEATURES, 0);
		};
	}, [map, running, reduced]);

	return null;
}

/**
 * Own position as numbers. The cold-offline start has no tiles to draw on, and
 * a hider who wants to know whether they have drifted is served by a coordinate
 * when they cannot be served by a picture. m2-spec §11.
 */
export function OwnPositionReadout({ fix }: { fix: PositionSnapshot | null }) {
	if (!fix || fix.source === "unavailable") return null;
	const accuracy = formatAccuracy(fix.accuracyMeters);
	return (
		<p data-testid="own-readout">
			{formatCoordinates([fix.lng, fix.lat])}
			{accuracy === null ? null : ` · ${accuracy}`}
		</p>
	);
}
