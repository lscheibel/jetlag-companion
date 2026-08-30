import { useMemo } from "react";
import { usePlayerTrailLine } from "./draft-paint";
import {
	buildPlayerTrails,
	type TrailPlayer,
	type TrailSnapshot,
	trailsFeature,
} from "./player-trails";
import { useGeoJsonLayer } from "./use-geojson-layer";

/**
 * How far back a trail reaches. m2-spec §4, _Trails_.
 *
 * Long enough to hold the leg somebody is currently on — a couple of stops and
 * the walk either side of them — and short enough that a two-hour round does
 * not end with eight players' whole afternoons drawn over each other.
 */
const TRAIL_WINDOW_MS = 15 * 60_000;

interface PlayerTrailsLayerProps {
	readonly rows: readonly TrailSnapshot[];
	readonly players: readonly TrailPlayer[];
	readonly roundId: string | null;
}

/**
 * Where everyone has been this round. m2-spec §4 as amended.
 *
 * The rows arrive already filtered by `queries.positionLog()` and the players
 * already filtered by `visibleMarkers`, which is what makes a blinded hider
 * lose other teams' trails at the same moment they lose their markers, through
 * the same switch, with no second rule to keep in step. There is no visibility
 * check in here.
 */
export function PlayerTrailsLayer({
	rows,
	players,
	roundId,
}: PlayerTrailsLayerProps) {
	const trails = useMemo(
		() =>
			buildPlayerTrails({
				rows,
				players,
				roundId,
				windowMs: TRAIL_WINDOW_MS,
			}),
		[rows, players, roundId],
	);
	const data = useMemo(() => trailsFeature(trails, TRAIL_WINDOW_MS), [trails]);
	/**
	 * Quiet on purpose. A trail is context for a marker, not a thing to read:
	 * everything else on this map that matters — the marker, the game area, a
	 * cut, a zone — is a solid stroke at full contrast, and a history painted at
	 * that weight would compete with all of them at once. m2-spec §4, _Trails_.
	 */
	const layers = usePlayerTrailLine("player-trails");
	useGeoJsonLayer("player-trails-source", data, layers);

	/**
	 * WebGL paints no DOM, so this is what an e2e test can assert a trail by.
	 * The ids only — a list of coordinates here would be the leak the query is
	 * written to prevent, published in the accessibility tree.
	 */
	return (
		<span className="sr-only" data-testid="player-trails">
			{trails.map((trail) => trail.playerId).join(" ")}
		</span>
	);
}
