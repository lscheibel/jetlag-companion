/**
 * The stop catalog: every station in Germany, in a generated file. m4-spec §2.
 *
 * Not a database. 251,741 stations serialise to 22.4 MB of compact JSON, and
 * the only query anything runs over them is a bounding box — which over 22 MB
 * held in the server process is a linear scan measured in tens of milliseconds,
 * on a screen a host opens once.
 */

/** One named line at a station. Distinct `(short name, mode)` — m4-spec inventory, shown on tap. */
export interface StopLine {
	readonly name: string;
	readonly modeId: string;
}

export interface CatalogStop {
	/** The feed's own `stop_id`. Not stable across rebuilds — m4-spec §4. */
	readonly id: string;
	readonly name: string;
	readonly lng: number;
	readonly lat: number;
	/** Rolled up from `lines` at build time, so the two cannot drift. */
	readonly modeIds: readonly string[];
	readonly lines: readonly StopLine[];
}

export interface StopCatalog {
	/**
	 * Content hash of the stops, which *is* the version — there is no registry
	 * to keep in step with it. Stops are written in id order, so the hash is a
	 * function of the feed alone and a rebuild over the same feed produces a
	 * byte-identical file. m4-spec §4.
	 */
	readonly version: string;
	readonly feedPublisher: string;
	readonly builtAt: number;
	readonly stops: readonly CatalogStop[];
}

/** A stop copied onto a map config. The row shape of `mapStop`. m4-spec §5. */
export interface MaterialisedStop {
	readonly stopId: string;
	readonly name: string;
	readonly lng: number;
	readonly lat: number;
	readonly modeIds: readonly string[];
	readonly lines: readonly StopLine[];
	readonly insideArea: boolean;
}
