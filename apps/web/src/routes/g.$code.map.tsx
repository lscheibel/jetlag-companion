import { useQuery, useZero } from "@rocicorp/zero/react";
import { buildValidHidingArea } from "@zero-lag/catalog";
import {
	isEmptyRegion,
	type LngLat,
	multiPolygonBBox,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { mutators, queries } from "@zero-lag/schema";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FoundSheet } from "../game/found-sheet";
import { HiderSelector } from "../game/hider-selector";
import { HidingSheet } from "../game/hiding-sheet";
import { RoundBar } from "../game/round-bar";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";
import { useSearchArea } from "../game/use-search-area";
import { ZoneNotice } from "../game/zone-notice";
import { BuildingsLayer } from "../map/buildings-layer";
import { type Camera, FREE, nextCamera } from "../map/camera";
import { CameraController } from "../map/camera-controller";
import { ConstraintDraftLayer } from "../map/constraint-draft-layer";
import { DrawLayer } from "../map/draw-layer";
import { EliminatedLayer } from "../map/eliminated-layer";
import { GameAreaLayer } from "../map/game-area-layer";
import { MapCanvas, type MapStatus } from "../map/map-canvas";
import { MapControls } from "../map/map-controls";
import {
	MapFlyTo,
	MapTapHandler,
	RadiusDragHandler,
} from "../map/map-interactions";
import { CoordinateCopy, MapToolSheet } from "../map/map-tool-sheet";
import { MeasureLayer } from "../map/measure-layer";
import { NorthReset } from "../map/north-reset";
import { OwnPosition, OwnPositionReadout } from "../map/own-position";
import { PinLayer } from "../map/pin-layer";
import { PlayerMarker } from "../map/player-marker";
import { PlayerSheet } from "../map/player-sheet";
import {
	buildMapPlayers,
	type MapPlayer,
	visibleMarkers,
} from "../map/players";
import { SearchZoneLayer } from "../map/search-zone-layer";
import {
	type ConstraintListItem,
	type MapTool,
	type SearchableStop,
	type SearchResult,
	stopPosition,
} from "../map/toolkit";
import { useBlindness } from "../map/use-blindness";
import { boundaryAtPoint, useBoundaries } from "../map/use-boundaries";
import { useCompassHeading } from "../map/use-compass-heading";
import { useNow } from "../map/use-now";
import { useWakeLock } from "../map/use-wake-lock";

/** Berlin, for a map that has nothing else to go on. */
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
	const zero = useZero();

	const [players] = useQuery(queries.players());
	const [teams] = useQuery(queries.teams());
	const [games] = useQuery(queries.game());
	// The board everybody plays on: no visibility filter, because there has never
	// been a version of this feature where one team sees a different board than
	// another. m4-spec §2.
	const [mapStops] = useQuery(queries.mapStops());
	const [pins] = useQuery(queries.pins());
	const [searchZones] = useQuery(queries.searchZones());
	const [rounds] = useQuery(queries.rounds());
	const [constraints] = useQuery(queries.constraints());

	const [camera, setCamera] = useState<Camera>(FREE);
	const [status, setStatus] = useState<MapStatus>("loading");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [tool, setTool] = useState<MapTool>({ kind: "none" });
	const [draftPoint, setDraftPoint] = useState<LngLat | null>(null);
	const [draftRadius, setDraftRadius] = useState<number | null>(null);
	const [flyTarget, setFlyTarget] = useState<
		| { readonly kind: "point"; readonly point: LngLat }
		| {
				readonly kind: "bounds";
				readonly bounds: readonly [number, number, number, number];
		  }
		| null
	>(null);
	/**
	 * MapLibre does not re-fetch a style that failed, so coming back from a
	 * tunnel is a remount rather than a recovery. Bumping this is the only thing
	 * the retry button does.
	 */
	const [attempt, setAttempt] = useState(0);
	const [pickedHiderTeamId, setPickedHiderTeamId] = useState<string | null>(
		null,
	);

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
	const myTeam = teams.find((team) => team.id === role.teamId);
	const editingPin =
		tool.kind === "editingPin"
			? (pins.find((pin) => pin.id === tool.pinId) ?? null)
			: null;
	const zone = searchZones[0] ?? null;
	const measure = tool.kind === "measure" ? tool.measure : null;
	const origin: LngLat =
		ownFix && ownFix.source !== "unavailable"
			? [ownFix.lng, ownFix.lat]
			: initialBounds
				? [
						(initialBounds[0] + initialBounds[2]) / 2,
						(initialBounds[1] + initialBounds[3]) / 2,
					]
				: FALLBACK_CENTER;

	const liveRound =
		[...rounds].reverse().find((round) => round.status !== "ended") ?? null;
	const hiderTeams = teams.filter((team) =>
		liveRound?.roles.some(
			(assignment) =>
				assignment.teamId === team.id && assignment.role === "hider",
		),
	);
	const hiderTeamId =
		pickedHiderTeamId &&
		hiderTeams.some((team) => team.id === pickedHiderTeamId)
			? pickedHiderTeamId
			: (hiderTeams[0]?.id ?? null);
	const searchArea = useSearchArea(hiderTeamId);
	const scopedConstraints = constraints.filter(
		(row) => row.hiderTeamId === hiderTeamId,
	);
	const constraintItems: readonly ConstraintListItem[] = scopedConstraints.map(
		(row) => ({
			id: row.id,
			source: row.source,
			mode: row.mode,
			kind: row.geometry.kind,
			enabled: row.enabled,
			name: row.name ?? null,
		}),
	);
	const canEditConstraints =
		role.role === "seeker" && role.teamId !== null && role.roundId !== null;

	const pickingLevel =
		tool.kind === "pickingBoundaryConstraint" ? tool.adminLevel : null;
	const areaBBox = area ? multiPolygonBBox(area) : null;
	const boundaries = useBoundaries(session, areaBBox, pickingLevel);
	const selectedBoundary =
		tool.kind === "pickingBoundaryConstraint" && tool.selectedId
			? (boundaries.find((row) => row.id === tool.selectedId) ?? null)
			: null;

	const cancelTool = () => {
		webPlatform.haptics.vibrate([15]);
		setTool({ kind: "none" });
		setDraftPoint(null);
		setDraftRadius(null);
	};

	const changeTool = (next: MapTool) => {
		if (
			next.kind === "placingPin" &&
			tool.kind === "measure" &&
			tool.measure.kind === "radius" &&
			tool.measure.center
		) {
			setDraftPoint(tool.measure.center);
			setDraftRadius(tool.measure.radiusMeters);
		}
		setTool(next);
	};

	const handleTap = (point: LngLat) => {
		if (
			tool.kind === "none" ||
			tool.kind === "editingPin" ||
			tool.kind === "listingConstraints"
		) {
			return;
		}
		webPlatform.haptics.vibrate([10]);
		if (tool.kind === "measure") {
			setTool({
				kind: "measure",
				measure:
					tool.measure.kind === "path"
						? { kind: "path", points: [...tool.measure.points, point] }
						: tool.measure.center
							? tool.measure
							: { ...tool.measure, center: point },
			});
			return;
		}
		if (tool.kind === "placingPin") {
			setDraftPoint(point);
			return;
		}
		if (tool.kind === "drawingRadiusConstraint") {
			if (tool.center) return;
			setTool({ ...tool, center: point });
			return;
		}
		if (tool.kind === "drawingPolygonConstraint") {
			setTool({ ...tool, ring: [...tool.ring, point] });
			return;
		}
		if (tool.kind === "pickingBoundaryConstraint") {
			const hit = boundaryAtPoint(boundaries, point);
			if (!hit) return;
			setTool({ ...tool, selectedId: hit.id });
			const box = multiPolygonBBox(hit.polygons);
			if (box) setFlyTarget({ kind: "bounds", bounds: box });
			return;
		}
		setTool({ ...tool, center: point });
	};

	const handleSearchResult = (result: SearchResult) => {
		if (result.kind === "coordinate") {
			setFlyTarget({ kind: "point", point: result.parsed.point });
			setDraftPoint(result.parsed.point);
			setTool({ kind: "placingPin" });
			return;
		}
		setFlyTarget({ kind: "point", point: stopPosition(result.stop) });
	};

	const handleSearchStopZone = (stop: SearchableStop) => {
		// One radius rather than one per mode: in the game they are one thing,
		// and per-mode radii return with the toggles in M18. m4-spec §3.
		const radius = games[0]?.mapConfig?.hidingRadiusMeters ?? 500;
		const point = stopPosition(stop);
		setFlyTarget({ kind: "point", point });
		setTool({
			kind: "placingZone",
			center: point,
			radiusMeters: radius,
			stopId: stop.stopId,
		});
	};

	/**
	 * A game whose roster has not arrived is not a game with nobody in it. Zero
	 * resolves named queries on the server, so a client launched with no
	 * connection has no synced data at all — not stale data, none. m2-spec §11.
	 */
	const loaded = players.length > 0;
	const event = () => ({ eventId: crypto.randomUUID() });

	const savePin = (input: {
		label: string;
		note: string;
		color: string;
		radiusMeters: number | null;
	}) => {
		if (!role.teamId) return;
		if (editingPin) {
			void zero.mutate(
				mutators.pin.update({
					...event(),
					pinId: editingPin.id,
					...input,
				}),
			);
		} else if (draftPoint) {
			void zero.mutate(
				mutators.pin.create({
					...event(),
					pinId: crypto.randomUUID(),
					teamId: role.teamId,
					roundId: role.roundId,
					lng: draftPoint[0],
					lat: draftPoint[1],
					...input,
					radiusMeters: draftRadius ?? input.radiusMeters,
				}),
			);
		}
		webPlatform.haptics.vibrate([15]);
		cancelTool();
	};

	const saveZone = (note: string) => {
		if (
			tool.kind !== "placingZone" ||
			!tool.center ||
			!role.teamId ||
			!role.roundId
		) {
			return;
		}
		void zero.mutate(
			mutators.searchZone.declare({
				...event(),
				zoneId: zone?.id ?? crypto.randomUUID(),
				roundId: role.roundId,
				seekerTeamId: role.teamId,
				stopId: tool.stopId,
				lng: tool.center[0],
				lat: tool.center[1],
				radiusMeters: tool.radiusMeters,
				note,
			}),
		);
		cancelTool();
	};

	const clearZone = () => {
		if (zone) {
			void zero.mutate(
				mutators.searchZone.clear({ ...event(), zoneId: zone.id }),
			);
		}
		cancelTool();
	};

	const commitConstraint = (mode: "include" | "exclude", name: string) => {
		if (!role.teamId || !role.roundId || !hiderTeamId) return;
		const ordinal =
			scopedConstraints.reduce((max, row) => Math.max(max, row.ordinal), -1) +
			1;
		const label = name.trim() || null;
		if (tool.kind === "drawingRadiusConstraint" && tool.center) {
			void zero.mutate(
				mutators.constraint.createManual({
					...event(),
					constraintId: crypto.randomUUID(),
					roundId: role.roundId,
					seekerTeamId: role.teamId,
					hiderTeamId,
					geometry: {
						kind: "radius",
						center: [tool.center[0], tool.center[1]],
						radius: tool.radiusMeters,
					},
					mode,
					ordinal,
					name: label,
				}),
			);
		} else if (
			tool.kind === "drawingPolygonConstraint" &&
			tool.ring.length >= 3
		) {
			const region = buildValidHidingArea(tool.ring);
			if (isEmptyRegion(region)) return;
			void zero.mutate(
				mutators.constraint.createManual({
					...event(),
					constraintId: crypto.randomUUID(),
					roundId: role.roundId,
					seekerTeamId: role.teamId,
					hiderTeamId,
					geometry: {
						kind: "polygon",
						polygons: regionToMultiPolygon(region).map((polygon) =>
							polygon.map((ring) =>
								ring.map(([lng, lat]) => [lng, lat] as [number, number]),
							),
						),
					},
					mode,
					ordinal,
					name: label,
				}),
			);
		} else if (tool.kind === "pickingBoundaryConstraint" && selectedBoundary) {
			void zero.mutate(
				mutators.constraint.createManual({
					...event(),
					constraintId: crypto.randomUUID(),
					roundId: role.roundId,
					seekerTeamId: role.teamId,
					hiderTeamId,
					geometry: {
						kind: "polygon",
						polygons: selectedBoundary.polygons.map((polygon) =>
							polygon.map((ring) =>
								ring.map(([lng, lat]) => [lng, lat] as [number, number]),
							),
						),
					},
					mode,
					ordinal,
					name: label,
				}),
			);
		} else {
			return;
		}
		webPlatform.haptics.vibrate([15]);
		cancelTool();
	};

	const renameConstraint = (id: string, name: string) => {
		void zero.mutate(
			mutators.constraint.setName({
				...event(),
				constraintId: id,
				name: name.trim() || null,
			}),
		);
	};

	const toggleConstraint = (id: string, enabled: boolean) => {
		void zero.mutate(
			mutators.constraint.setEnabled({
				...event(),
				constraintId: id,
				enabled,
			}),
		);
	};

	const removeConstraint = (id: string) => {
		void zero.mutate(
			mutators.constraint.remove({ ...event(), constraintId: id }),
		);
	};

	return (
		<main
			className={`absolute inset-0 overflow-hidden ${tool.kind === "none" ? "" : "[&_.maplibregl-marker]:pointer-events-none"}`}
		>
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
				<BuildingsLayer />
				<EliminatedLayer
					eliminated={searchArea.eliminated}
					surviving={searchArea.surviving}
				/>
				<SearchZoneLayer zone={zone} />
				<PinLayer
					disabled={tool.kind !== "none"}
					onSelect={(pinId) => setTool({ kind: "editingPin", pinId })}
					pins={pins}
				/>
				<MeasureLayer measure={measure} />
				{tool.kind === "drawingRadiusConstraint" && (
					<ConstraintDraftLayer
						center={tool.center}
						radiusMeters={tool.radiusMeters}
					/>
				)}
				{tool.kind === "pickingBoundaryConstraint" && (
					<ConstraintDraftLayer polygons={selectedBoundary?.polygons ?? null} />
				)}
				{tool.kind === "drawingPolygonConstraint" && (
					<DrawLayer ring={tool.ring} />
				)}
				<CameraController
					camera={camera}
					fix={ownFix}
					headingDeg={headingDeg}
					onUserGesture={() => setCamera(FREE)}
				/>
				<MapTapHandler onTap={handleTap} />
				<RadiusDragHandler
					active={
						(tool.kind === "measure" && tool.measure.kind === "radius") ||
						tool.kind === "drawingRadiusConstraint"
					}
					onChange={(center, radiusMeters) => {
						if (tool.kind === "drawingRadiusConstraint") {
							setTool({
								kind: "drawingRadiusConstraint",
								center,
								radiusMeters,
							});
							return;
						}
						setTool({
							kind: "measure",
							measure: { kind: "radius", center, radiusMeters },
						});
					}}
				/>
				<MapFlyTo target={flyTarget} />
				<NorthReset />
				<OwnPosition fix={ownFix} headingDeg={headingDeg} />
				{others.map((player) => (
					<PlayerMarker
						key={player.playerId}
						onSelect={(playerId) => {
							if (tool.kind === "none") setSelectedId(playerId);
						}}
						player={player}
					/>
				))}
			</MapCanvas>

			{status === "unavailable" && (
				<OfflineSurface onRetry={() => setAttempt((n) => n + 1)} />
			)}

			<header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-background/90 p-3 pr-24 text-sm">
				<Link
					className="min-h-11 rounded border px-3 py-2"
					data-testid="back-to-lobby"
					to={`/g/${session.code}`}
				>
					Lobby
				</Link>
				<span className="sr-only" data-testid="my-role">
					{role.role ?? "no role"}
				</span>
				<RoundBar clockOffsetMs={ephemeral.clockOffsetMs} />
				<HiderSelector
					hiders={hiderTeams}
					onSelect={setPickedHiderTeamId}
					selectedId={hiderTeamId}
				/>
				{!loaded && (
					<span className="ml-auto" data-testid="game-not-loaded">
						Game not loaded yet.
					</span>
				)}
			</header>
			<span className="sr-only" data-testid="surviving-area-hash">
				{searchArea.hash ?? ""}
			</span>
			<span className="sr-only" data-testid="constraint-count">
				{scopedConstraints.length}
			</span>
			<span className="sr-only" data-testid="pins-synced-count">
				{pins.length}
			</span>
			<span className="sr-only" data-testid="search-zones-synced-count">
				{searchZones.length}
			</span>

			{/*
			 * Own position as numbers, always. The picture is the part that needs a
			 * network; a hider who wants to know whether they have drifted is served
			 * by a coordinate when they cannot be served by a map. m2-spec §11.
			 */}
			<div className="absolute top-16 right-3 z-10 rounded bg-background/90 px-2 py-1 text-xs shadow">
				<OwnPositionReadout fix={ownFix} />
				{ownFix && ownFix.source !== "unavailable" && (
					<CoordinateCopy point={[ownFix.lng, ownFix.lat]} />
				)}
			</div>
			<div className="absolute inset-x-3 top-32 z-20 mx-auto max-w-xl">
				<ZoneNotice fix={ownFix} role={role} />
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

			<div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 mx-auto w-full max-w-xl space-y-2 p-3">
				<div className="ml-auto max-w-sm">
					{tool.kind === "none" && <HidingSheet role={role} />}
					{tool.kind === "none" && (
						<FoundSheet role={role} token={session.token} />
					)}
				</div>
				<MapToolSheet
					boundaries={boundaries}
					canEditConstraints={canEditConstraints}
					canPlaceZone={
						role.role === "seeker" &&
						role.teamId !== null &&
						role.roundId !== null
					}
					constraints={constraintItems}
					draftPoint={draftPoint}
					editingPin={editingPin}
					stops={mapStops}
					onCancel={cancelTool}
					onClearZone={clearZone}
					onCommitConstraint={commitConstraint}
					onDeletePin={() => {
						if (editingPin) {
							void zero.mutate(
								mutators.pin.delete({
									...event(),
									pinId: editingPin.id,
								}),
							);
						}
						cancelTool();
					}}
					onRemoveConstraint={removeConstraint}
					onRenameConstraint={renameConstraint}
					onSavePin={savePin}
					onSaveZone={saveZone}
					onSelectBoundary={(id) => {
						if (tool.kind !== "pickingBoundaryConstraint") return;
						if (id === null) {
							setTool({ ...tool, selectedId: null });
							return;
						}
						const row = boundaries.find((item) => item.id === id);
						setTool({ ...tool, selectedId: id });
						if (!row) return;
						const box = multiPolygonBBox(row.polygons);
						if (box) setFlyTarget({ kind: "bounds", bounds: box });
					}}
					onSearchResult={handleSearchResult}
					onSearchStopZone={handleSearchStopZone}
					onSeedMeasure={() => {
						if (
							tool.kind === "measure" &&
							tool.measure.kind === "path" &&
							ownFix &&
							ownFix.source !== "unavailable"
						) {
							setTool({
								kind: "measure",
								measure: {
									kind: "path",
									points: [[ownFix.lng, ownFix.lat]],
								},
							});
						}
					}}
					onToggleConstraint={toggleConstraint}
					onToolChange={changeTool}
					onUndoMeasure={() => {
						if (tool.kind !== "measure" || tool.measure.kind !== "path") return;
						setTool({
							kind: "measure",
							measure: {
								kind: "path",
								points: tool.measure.points.slice(0, -1),
							},
						});
					}}
					onUndoPolygonVertex={() => {
						if (tool.kind !== "drawingPolygonConstraint") return;
						setTool({
							kind: "drawingPolygonConstraint",
							ring: tool.ring.slice(0, -1),
						});
					}}
					origin={origin}
					teamColor={myTeam?.color ?? "#0072B2"}
					tool={tool}
				/>
			</div>

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
