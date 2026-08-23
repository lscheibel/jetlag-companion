import type { BBox, LngLat } from "@zero-lag/geo";
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
 * Positron because the map is context and the players are the content — Bright
 * and Liberty would bury a 24px marker in café pins. Dark and Fiord 3D live on
 * the same provider, which is what makes a night mode a URL and M3's buildings
 * a style swap rather than a second map stack.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Required by OpenFreeMap, required by OpenStreetMap's licence, and pointed at
 * by the build plan's first principle. Always visible, never collapsible.
 */
export const ATTRIBUTION = "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

/**
 * `unavailable` is the honest state of a cold start with no connection: the
 * style comes from the network and m2-spec §3 caches no tiles, ever. The canvas
 * is empty and says so, rather than being a broken grey rectangle.
 */
export type MapStatus = "loading" | "ready" | "unavailable";

const MapContext = createContext<MapLibreMap | null>(null);

export function useMapInstance(): MapLibreMap | null {
	return useContext(MapContext);
}

interface MapCanvasProps {
	/** Where to open, when there is nothing better. Berlin, from the fixture. */
	readonly initialCenter: LngLat;
	/** Derived from the valid hiding area, never stored. m2-spec §2. */
	readonly initialBounds: BBox | null;
	readonly onStatusChange: (status: MapStatus) => void;
	readonly children: ReactNode;
}

export function MapCanvas({
	initialCenter,
	initialBounds,
	onStatusChange,
	children,
}: MapCanvasProps) {
	const container = useRef<HTMLDivElement | null>(null);
	const [map, setMap] = useState<MapLibreMap | null>(null);

	/**
	 * The opening camera is read once, at creation, rather than tracked.
	 *
	 * It is where the map *opens*; re-flying it because a query resolved a second
	 * later would yank the view out from under a thumb that has already started
	 * panning.
	 */
	const opening = useRef({ initialCenter, initialBounds });
	const report = useRef(onStatusChange);
	report.current = onStatusChange;

	useEffect(() => {
		const node = container.current;
		if (!node) return;

		const created = new MapLibreMap({
			container: node,
			style: MAP_STYLE_URL,
			center: [
				opening.current.initialCenter[0],
				opening.current.initialCenter[1],
			],
			zoom: 11,
			attributionControl: false,
			pitchWithRotate: true,
			dragRotate: true,
		});

		const bounds = opening.current.initialBounds;
		if (bounds) {
			created.fitBounds(
				[
					[bounds[0], bounds[1]],
					[bounds[2], bounds[3]],
				],
				{ padding: 48, animate: false },
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

		let settled = false;
		created.on("load", () => {
			settled = true;
			report.current("ready");
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
			observer.disconnect();
			setMap(null);
			created.remove();
		};
	}, []);

	/**
	 * Two elements rather than one: MapLibre's own stylesheet sets
	 * `position: relative` on the container it is given, which quietly cancels an
	 * `absolute inset-0` and collapses it to nothing — the canvas inside is
	 * absolutely positioned, so there is no content to give it a height. The
	 * outer element owns the size; the inner one is MapLibre's.
	 */
	return (
		<div className="absolute inset-0">
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
				className="pointer-events-none absolute right-0 bottom-0 z-10 bg-surface/80 px-1 text-[10px] text-ink-dim"
				data-testid="map-attribution"
			>
				{ATTRIBUTION}
			</p>
			<MapContext value={map}>{map ? children : null}</MapContext>
		</div>
	);
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
