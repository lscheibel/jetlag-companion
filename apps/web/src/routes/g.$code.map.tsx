import { useQuery } from "@rocicorp/zero/react";
import { multiPolygonBBox } from "@zero-lag/geo";
import { queries } from "@zero-lag/schema";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";
import { type Camera, FREE, nextCamera } from "../map/camera";
import { CameraController } from "../map/camera-controller";
import { GameAreaLayer } from "../map/game-area-layer";
import { MapCanvas, type MapStatus } from "../map/map-canvas";
import { MapControls } from "../map/map-controls";
import { OwnPosition, OwnPositionReadout } from "../map/own-position";
import { PlayerMarker } from "../map/player-marker";
import { PlayerSheet } from "../map/player-sheet";
import {
	buildMapPlayers,
	type MapPlayer,
	visibleMarkers,
} from "../map/players";
import { useBlindness } from "../map/use-blindness";
import { useCompassHeading } from "../map/use-compass-heading";
import { useNow } from "../map/use-now";
import { useWakeLock } from "../map/use-wake-lock";

/** Berlin, from the fixture area pack, for a map that has nothing else to go on. */
const FALLBACK_CENTER = [13.4132, 52.5219] as const;

/**
 * The map. m2-spec §12.
 *
 * Everyone can see who is playing; only some people can see where. That rule is
 * enforced on the server — the channel filters fields at fan-out and
 * `queries.positionLog()` filters rows at query resolution — and this screen
 * renders what it is given. There is deliberately no visibility check anywhere
 * below this comment: anything the client has to remember to hide is a leak
 * waiting for a refactor. m2-spec §7.
 */
export default function MapRoute() {
	const { session, ephemeral, tracking } = useGameShell();
	const role = useMyRole(session.playerId);

	const [players] = useQuery(queries.players());
	const [teams] = useQuery(queries.teams());
	const [games] = useQuery(queries.game());

	const [camera, setCamera] = useState<Camera>(FREE);
	const [status, setStatus] = useState<MapStatus>("loading");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	/**
	 * MapLibre does not re-fetch a style that failed, so coming back from a
	 * tunnel is a remount rather than a recovery. Bumping this is the only thing
	 * the retry button does.
	 */
	const [attempt, setAttempt] = useState(0);

	const headingDeg = useCompassHeading();
	const blindness = useBlindness(session.gameId);
	const now = useNow();

	const roundRunning =
		role.roundStatus === "hiding" || role.roundStatus === "seeking";
	useWakeLock(roundRunning);

	const area = games[0]?.mapConfig?.validHidingArea ?? null;
	// Derived, never stored: a stored camera goes stale the moment M4 lets a host
	// redraw the area. m2-spec §2.
	const initialBounds = useMemo(
		() => (area ? multiPolygonBBox(area) : null),
		[area],
	);

	const ownFix = tracking.lastFix;
	const hasCompass = headingDeg !== null;

	const mapPlayers = buildMapPlayers({
		players,
		teams,
		entries: ephemeral.entries,
		entriesArrivedAt: ephemeral.entriesArrivedAt,
		now,
		selfPlayerId: session.playerId,
	});

	// Offered to hiders only. A seeker sees their own team and nobody else, so
	// the toggle would be a no-op with a confusing label. m2-spec §9.
	const blindnessControl = role.role === "hider" ? blindness : null;
	const shown = visibleMarkers(
		mapPlayers,
		blindnessControl?.blind ?? false,
		role.teamId,
	);
	const others = shown.filter((player) => !player.isSelf);
	const selected = others.find((player) => player.playerId === selectedId);

	/**
	 * A game whose roster has not arrived is not a game with nobody in it. Zero
	 * resolves named queries on the server, so a client launched with no
	 * connection has no synced data at all — not stale data, none. m2-spec §11.
	 */
	const loaded = players.length > 0;

	return (
		<main className="absolute inset-0 overflow-hidden">
			<MapCanvas
				initialBounds={initialBounds}
				initialCenter={
					ownFix && ownFix.source !== "unavailable"
						? [ownFix.lng, ownFix.lat]
						: FALLBACK_CENTER
				}
				key={attempt}
				onStatusChange={setStatus}
			>
				<GameAreaLayer area={area} />
				<CameraController
					camera={camera}
					fix={ownFix}
					headingDeg={headingDeg}
					onUserGesture={() => setCamera(FREE)}
				/>
				<OwnPosition fix={ownFix} headingDeg={headingDeg} />
				{others.map((player) => (
					<PlayerMarker
						key={player.playerId}
						onSelect={setSelectedId}
						player={player}
					/>
				))}
			</MapCanvas>

			{status === "unavailable" && (
				<OfflineSurface onRetry={() => setAttempt((n) => n + 1)} />
			)}

			<header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-background/90 p-3 text-sm">
				<Link
					className="min-h-11 rounded border px-3 py-2"
					data-testid="back-to-lobby"
					to={`/g/${session.code}`}
				>
					Lobby
				</Link>
				<span data-testid="my-role">{role.role ?? "no role"}</span>
				{!loaded && (
					<span className="ml-auto" data-testid="game-not-loaded">
						Game not loaded yet.
					</span>
				)}
			</header>

			{/*
			 * Own position as numbers, always. The picture is the part that needs a
			 * network; a hider who wants to know whether they have drifted is served
			 * by a coordinate when they cannot be served by a map. m2-spec §11.
			 */}
			<div className="absolute top-16 right-3 z-10 rounded bg-background/90 px-2 py-1 text-xs shadow">
				<OwnPositionReadout fix={ownFix} />
			</div>

			<AbsentPlayers players={others} />

			<MapControls
				blindness={blindnessControl}
				camera={camera}
				onCycleCamera={() =>
					setCamera((current) => nextCamera(current, hasCompass))
				}
				trackingNotice="Tracking pauses when the screen locks."
			/>

			{selected && (
				<PlayerSheet onClose={() => setSelectedId(null)} player={selected} />
			)}
		</main>
	);
}

/**
 * A cold start with no connection. m2-spec §11.
 *
 * Not a spinner and not an error. A spinner implies something is about to
 * happen, and a phone underground has no idea whether that is true. The map
 * comes from the network and §3 caches no tiles by design, so the canvas is
 * empty and says why.
 */
function OfflineSurface({ onRetry }: { onRetry: () => void }) {
	return (
		<div
			className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 bg-muted/60 p-6 text-center text-sm"
			data-testid="map-unavailable"
		>
			<p>Map unavailable offline. Your own position is still shown.</p>
			<button
				className="min-h-11 rounded border bg-background px-4"
				data-testid="retry-map"
				onClick={onRetry}
				type="button"
			>
				Try again
			</button>
		</div>
	);
}

/**
 * Everybody with no marker to put anywhere: in the game, and either never
 * connected or never managed a fix. Dropping them from the screen would be
 * exactly the "silently wrong" the build plan's reviewable-when rules out.
 * m2-spec §6.
 */
function AbsentPlayers({ players }: { players: readonly MapPlayer[] }) {
	const absent = players.filter(
		(player) => player.fix === null || player.fix.source === "unavailable",
	);
	if (absent.length === 0) return null;

	return (
		<p
			className="absolute top-16 left-3 z-10 rounded bg-background/90 px-2 py-1 text-xs shadow"
			data-testid="absent-players"
		>
			No position: {absent.map((player) => player.displayName).join(", ")}
		</p>
	);
}
