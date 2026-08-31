import type { BBox, LngLat } from "@zero-lag/geo";
import { createContext, type ReactNode, useContext } from "react";
import type { MapPin } from "./pin-layer";
import type { MapPoi } from "./poi";
import type { PoiTypeId } from "./poi-type";

/** A fix worth offering as a source: where, how sure, and when. */
export interface PointFix {
	readonly point: LngLat;
	readonly accuracyMeters: number;
	/** The phone's own clock, so the age is arithmetic at render time. */
	readonly capturedAt: number;
}

/**
 * Everything a point picker can copy a coordinate out of.
 *
 * The map route already holds all of it — the fix from the local watch, the
 * pins from Zero, the places from the catalog fetch, the hiding commitment
 * from the round — and the pickers sit four cards deep inside it. A context
 * rather than props, because the alternative is the same five values threaded
 * through `MapBar` and `MapOverlay`, neither of which has any use for them.
 */
export interface PointSources {
	/** Null until this phone has a fix. A source nobody can use is not offered. */
	readonly fix: PointFix | null;
	readonly pins: readonly MapPin[];
	readonly places: readonly MapPoi[];
	/** The types the board carries, in signage order, amenities after. */
	readonly placeTypes: readonly PoiTypeId[];
	/**
	 * The hider's own committed stop. Null for seekers, and null for a hider
	 * who has not committed a zone yet — in both cases the row is absent.
	 */
	readonly hidingZoneStop: {
		readonly name: string;
		readonly point: LngLat;
	} | null;
	/** What "nearest" is measured from, or null with nothing to measure from. */
	readonly origin: LngLat | null;
	/**
	 * The game area's extent, which is how a pasted pair of small numbers gets
	 * its order settled. Null before a game has an area, and then a paste falls
	 * back on reading the first number as the latitude.
	 */
	readonly area: BBox | null;
}

const NOTHING: PointSources = {
	fix: null,
	pins: [],
	places: [],
	placeTypes: [],
	hidingZoneStop: null,
	origin: null,
	area: null,
};

const PointSourcesContext = createContext<PointSources>(NOTHING);

export function PointSourcesProvider({
	value,
	children,
}: {
	readonly value: PointSources;
	readonly children: ReactNode;
}) {
	return (
		<PointSourcesContext.Provider value={value}>
			{children}
		</PointSourcesContext.Provider>
	);
}

/** Outside a provider every source is simply absent, and the field still types. */
export function usePointSources(): PointSources {
	return useContext(PointSourcesContext);
}
