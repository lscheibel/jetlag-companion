import type { BBox, LngLat } from "@zero-lag/geo";
import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { cn } from "@zero-lag/ui/lib/utils";
import { MapLibreMap, Marker } from "maplibre-gl";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The map, and the only `useEffect` this screen is really allowed. m2-spec §12.
 *
 * MapLibre owns an imperative object with its own lifecycle, which is what
 * `useEffect` is an escape hatch for. One effect creates it and one tears it
 * down; everything below is a component that syncs one imperative thing from
 * props.
 */

/**
 * OpenFreeMap's public instance. m2-spec §3.
 *
 * No key, no registration, no request ceiling, and nothing of ours to host.
 * Positron in the light, Dark at night. Same provider, so a theme change is a
 * style URL rather than a second map stack. Bright and Liberty would bury a
 * 24px marker in café pins.
 */
export const MAP_STYLE_URLS = {
	light: "https://tiles.openfreemap.org/styles/positron",
	dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/**
 * Required by OpenFreeMap, required by OpenStreetMap's licence, and pointed at
 * by the build plan's first principle. Always visible, never collapsible.
 */
export const ATTRIBUTION = "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

/**
 * `loading` is the style fetching and the first tiles painting. `ready` is the
 * first idle after that — the canvas has drawn what it has, which on a phone is
 * often a few seconds later than `load`. `unavailable` is a style that never
 * arrived.
 */
export type MapStatus = "loading" | "ready" | "unavailable";

/** A camera to restore instead of fitting bounds. */
export type MapCamera = {
	readonly center: LngLat;
	readonly zoom: number;
	readonly bearing: number;
	readonly pitch: number;
};

const MapContext = createContext<MapLibreMap | null>(null);

export function useMapInstance(): MapLibreMap | null {
	return useContext(MapContext);
}

interface MapCanvasProps {
	/** Where to open, when there is nothing better. Berlin, from the fixture. */
	readonly initialCenter: LngLat;
	/** Derived from the valid hiding area, never stored. m2-spec §2. */
	readonly initialBounds: BBox | null;
	/** When set, the map opens here and does not fit `initialBounds`. */
	readonly initialCamera?: MapCamera | null;
	/** Mini-maps need a few pixels; 48px on a 6.5rem strip fits the world. */
	readonly fitPadding?: number;
	readonly onStatusChange: (status: MapStatus) => void;
	readonly children: ReactNode;
}

export function MapCanvas({
	initialCenter,
	initialBounds,
	initialCamera = null,
	fitPadding = 48,
	onStatusChange,
	children,
}: MapCanvasProps) {
	const { resolved } = useTheme();
	const styleUrl = MAP_STYLE_URLS[resolved];
	const container = useRef<HTMLDivElement | null>(null);
	const [map, setMap] = useState<MapLibreMap | null>(null);
	const [revealed, setRevealed] = useState(false);

	/**
	 * The opening camera is read once, at creation, rather than tracked.
	 *
	 * It is where the map *opens*; re-flying it because a query resolved a second
	 * later would yank the view out from under a thumb that has already started
	 * panning.
	 */
	const opening = useRef({
		initialCenter,
		initialBounds,
		initialCamera,
		fitPadding,
	});
	const report = useRef(onStatusChange);
	report.current = onStatusChange;
	/**
	 * Theme swaps rebuild the map so overlay layers remount against the new
	 * style. The view the thumb was looking at is not an opening camera, and
	 * re-fitting bounds would yank it.
	 */
	const restoredCamera = useRef<MapCamera | null>(null);

	useEffect(() => {
		const node = container.current;
		if (!node) return;

		const camera = restoredCamera.current ?? opening.current.initialCamera;
		const created = new MapLibreMap({
			container: node,
			style: styleUrl,
			center: camera
				? [camera.center[0], camera.center[1]]
				: [opening.current.initialCenter[0], opening.current.initialCenter[1]],
			zoom: camera?.zoom ?? 11,
			bearing: camera?.bearing ?? 0,
			pitch: camera?.pitch ?? 0,
			attributionControl: false,
			pitchWithRotate: true,
			dragRotate: true,
		});

		const bounds = opening.current.initialBounds;
		if (!camera && bounds) {
			created.fitBounds(
				[
					[bounds[0], bounds[1]],
					[bounds[2], bounds[3]],
				],
				{ padding: opening.current.fitPadding, animate: false },
			);
		}

		/**
		 * MapLibre sizes itself from `container.clientWidth || 400` at
		 * construction, and its own resize observer deliberately swallows the first
		 * entry it is given. A container that is not yet laid out at that instant
		 * therefore keeps the 400x300 fallback for the life of the map — a small
		 * grey rectangle in the corner of a full-screen map, which is what this
		 * screen looked like the first time it met a real style.
		 *
		 * Observing it ourselves fixes that and is wanted anyway: a phone turned
		 * sideways mid-round is a resize, and this is the app that gets used
		 * walking.
		 */
		const observer = new ResizeObserver(() => created.resize());
		observer.observe(node);

		setRevealed(false);
		report.current("loading");

		let settled = false;
		created.on("load", () => {
			settled = true;
			setMap(created);
		});
		/**
		 * An error before `load` is a style that never arrived, which in practice
		 * means no connection. Errors after it are individual tiles failing, which
		 * is the blank-grey-then-back-again behaviour §3 signed up for and not
		 * something to put a banner over.
		 */
		created.on("error", () => {
			if (settled) return;
			settled = true;
			report.current("unavailable");
		});

		return () => {
			restoredCamera.current = {
				center: [created.getCenter().lng, created.getCenter().lat],
				zoom: created.getZoom(),
				bearing: created.getBearing(),
				pitch: created.getPitch(),
			};
			observer.disconnect();
			setMap(null);
			created.remove();
		};
	}, [styleUrl]);

	/**
	 * Two elements rather than one: MapLibre's own stylesheet sets
	 * `position: relative` on the container it is given, which quietly cancels an
	 * `absolute inset-0` and collapses it to nothing — the canvas inside is
	 * absolutely positioned, so there is no content to give it a height. The
	 * outer element owns the size; the inner one is MapLibre's.
	 */
	return (
		<div
			className={cn(
				"absolute inset-0",
				revealed ? "zl-enter-fade" : "pointer-events-none opacity-0",
			)}
		>
			<div className="h-full w-full" data-testid="map-canvas" ref={container} />
			{/*
			 * Ours rather than MapLibre's `AttributionControl`.
			 *
			 * That control merges the loaded style's own attribution with anything
			 * passed to it, and OpenFreeMap's style carries the required credit
			 * already — so asking for both printed the same sentence twice, once as
			 * text and once as links. Rendering it here says it once, says it
			 * whether or not a style ever arrived, and cannot be collapsed into a
			 * little "i" button on a narrow screen. m2-spec §3.
			 */}
			<p
				className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-full bg-surface/80 px-2 py-0.5 text-[10px] text-ink-dim"
				data-testid="map-attribution"
			>
				{ATTRIBUTION}
			</p>
			<MapContext value={map}>
				{children}
				{map && (
					<MapIdleReady
						onIdle={() => {
							report.current("ready");
							setRevealed(true);
						}}
					/>
				)}
			</MapContext>
		</div>
	);
}

/**
 * `load` means the style arrived; `idle` means the current view has painted.
 * Reveal waits for that, because a phone can sit on a grey canvas for seconds
 * after the style JSON is in. A timeout is the escape if tiles never settle.
 */
function MapIdleReady({ onIdle }: { readonly onIdle: () => void }) {
	const map = useMapInstance();
	const onIdleRef = useRef(onIdle);
	onIdleRef.current = onIdle;

	useEffect(() => {
		if (!map) return;
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			onIdleRef.current();
		};
		map.once("idle", finish);
		map.triggerRepaint();
		const fallback = window.setTimeout(finish, 8_000);
		return () => {
			done = true;
			map.off("idle", finish);
			window.clearTimeout(fallback);
		};
	}, [map]);

	return null;
}

interface MapMarkerProps {
	readonly lng: number;
	readonly lat: number;
	readonly children: ReactNode;
}

/**
 * One React subtree rendered into one MapLibre marker.
 *
 * `createPortal` rather than a hand-built DOM node, so that `TeamBadge` renders
 * a team on the map exactly as it does in the lobby — m1-spec §4's promise was
 * written for this screen, where a 24px marker in bright sun is the first place
 * colour-alone identification fails.
 */
export function MapMarker({ lng, lat, children }: MapMarkerProps) {
	const map = useMapInstance();
	const [element] = useState(() => document.createElement("div"));
	const marker = useRef<Marker | null>(null);
	/**
	 * Where to put the marker at the instant it is created, held in a ref so that
	 * moving it does not re-run creation. A marker rebuilt on every fix would tear
	 * down the portal's DOM node — and with it any open sheet — several times a
	 * minute.
	 */
	const position = useRef({ lng, lat });
	position.current = { lng, lat };

	useEffect(() => {
		if (!map) return;
		const created = new Marker({ element })
			.setLngLat([position.current.lng, position.current.lat])
			.addTo(map);
		marker.current = created;
		return () => {
			marker.current = null;
			created.remove();
		};
	}, [map, element]);

	useEffect(() => {
		marker.current?.setLngLat([lng, lat]);
	}, [lng, lat]);

	return createPortal(children, element);
}
