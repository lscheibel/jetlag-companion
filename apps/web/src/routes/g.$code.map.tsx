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
import { Screen } from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { useMemo, useState } from "react";
import { FoundSheet } from "../game/found-sheet";
import { GameTabs } from "../game/game-tabs";
import { HiderTeamSheet } from "../game/hider-selector";
import { HidingSheet } from "../game/hiding-sheet";
import { RoundBar } from "../game/round-bar";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";
import { useSearchArea } from "../game/use-search-area";
import { ZoneNotice } from "../game/zone-notice";
import { LobbyProvider } from "../lobby/actions";
import { LobbyChrome } from "../lobby/lobby-chrome";
import { BuilderStopsLayer } from "../map/builder-stops-layer";
import { BuildingsLayer } from "../map/buildings-layer";
import { type Camera, FREE, nextCamera } from "../map/camera";
import { CameraController } from "../map/camera-controller";
import { CircleDraftLayer } from "../map/circle-draft-layer";
import { ConstraintDraftLayer } from "../map/constraint-draft-layer";
import type { RadiusDraft, RingDraft } from "../map/draw-gestures";
import { DrawLayer } from "../map/draw-layer";
import { EliminatedLayer } from "../map/eliminated-layer";
import { GameAreaLayer } from "../map/game-area-layer";
import { MapBar } from "../map/map-bar";
import { MapCanvas, type MapStatus } from "../map/map-canvas";
import { MapControls } from "../map/map-controls";
import {
	MapFlyTo,
	MapPointerHandler,
	type PointerMode,
} from "../map/map-interactions";
import {
	CutsCard,
	GpsHelpSheet,
	MeasureCard,
	PinPromptCard,
} from "../map/map-overlay";
import type { GestureCause } from "../map/map-pointer";
import { MapHud } from "../map/map-rail";
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
import { StopSheet } from "../map/stop-sheet";
import {
	BOUNDARY_CONSTRAINT_LEVELS,
	type ConstraintListItem,
	type MapTool,
	nearestStopPx,
	type SearchableStop,
	type SearchResult,
	stopPosition,
} from "../map/toolkit";
import { useBlindness } from "../map/use-blindness";
import { boundaryAtPoint, useBoundaries } from "../map/use-boundaries";
import { useCompassHeading } from "../map/use-compass-heading";
import { useNow } from "../map/use-now";
import { useWakeLock } from "../map/use-wake-lock";
import { stepZoneMeters } from "../setup/game-size";

/** Berlin, for a map that has nothing else to go on. */
const FALLBACK_CENTER = [13.4132, 52.5219] as const;

function pointerMode(tool: MapTool): PointerMode {
	if (
		tool.kind === "editingPin" ||
		tool.kind === "listingConstraints" ||
		tool.kind === "searching"
	) {
		return { kind: "off" };
	}
	if (tool.kind === "none") {
		return { kind: "tap" };
	}
	if (tool.kind === "measure" && tool.measure.kind === "radius") {
		return {
			kind: "radius",
			center: tool.measure.center,
			radiusMeters: tool.measure.radiusMeters,
		};
	}
	if (tool.kind === "drawingRadiusConstraint" || tool.kind === "placingZone") {
		return {
			kind: "radius",
			center: tool.center,
			radiusMeters: tool.radiusMeters,
		};
	}
	if (tool.kind === "measure" && tool.measure.kind === "path") {
		return { kind: "ring", closed: false, points: tool.measure.points };
	}
	if (tool.kind === "drawingPolygonConstraint") {
		return { kind: "ring", closed: true, points: tool.ring };
	}
	return { kind: "tap" };
}

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
	return (
		<LobbyProvider>
			<MapScreen />
		</LobbyProvider>
	);
}

function MapScreen() {
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
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
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
	const [hiderSheetOpen, setHiderSheetOpen] = useState(false);
	const [cut, setCut] = useState(false);
	const [gpsHelpOpen, setGpsHelpOpen] = useState(false);

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
	const searchableStops = useMemo<readonly SearchableStop[]>(
		() =>
			mapStops.map((stop) => ({
				stopId: stop.stopId,
				name: stop.name,
				lng: stop.lng,
				lat: stop.lat,
				modeIds: stop.modeIds,
				lines: stop.lines ?? [],
				insideArea: stop.insideArea,
			})),
		[mapStops],
	);
	const selectedStop =
		searchableStops.find((stop) => stop.stopId === selectedStopId) ?? null;
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
	const defaultRadiusMeters = games[0]?.mapConfig?.hidingRadiusMeters ?? 800;

	const pickingLevels =
		tool.kind === "pickingBoundaryConstraint" ? BOUNDARY_CONSTRAINT_LEVELS : [];
	const areaBBox = area ? multiPolygonBBox(area) : null;
	const boundaries = useBoundaries(session, areaBBox, pickingLevels);
	const visibleBoundaries =
		tool.kind === "pickingBoundaryConstraint"
			? boundaries.filter(
					(row) =>
						(row.adminLevel === 9 || row.adminLevel === 10) &&
						tool.levels.includes(row.adminLevel),
				)
			: boundaries;
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
		if (next.kind !== "none") {
			setSelectedStopId(null);
		}
		setTool(next);
	};

	const handleTap = (
		point: LngLat,
		project: (lngLat: LngLat) => { x: number; y: number },
		screen: { x: number; y: number },
	) => {
		if (
			tool.kind === "editingPin" ||
			tool.kind === "listingConstraints" ||
			tool.kind === "searching"
		) {
			return;
		}
		if (tool.kind === "none") {
			const hit = nearestStopPx(searchableStops, screen, project);
			setSelectedStopId(hit?.stopId ?? null);
			if (hit) setSelectedId(null);
			return;
		}
		webPlatform.haptics.vibrate([10]);
		if (tool.kind === "placingPin") {
			setDraftPoint(point);
			return;
		}
		if (tool.kind === "pickingBoundaryConstraint") {
			const hit = boundaryAtPoint(visibleBoundaries, point);
			if (!hit) return;
			setTool({ ...tool, selectedId: hit.id });
			const box = multiPolygonBBox(hit.polygons);
			if (box) setFlyTarget({ kind: "bounds", bounds: box });
		}
	};

	const handleRadiusDraft = (draft: RadiusDraft, cause: GestureCause) => {
		if (cause === "tap") webPlatform.haptics.vibrate([10]);
		setTool((current) => {
			if (current.kind === "drawingRadiusConstraint") {
				return {
					...current,
					center: draft.center,
					radiusMeters: draft.radiusMeters,
				};
			}
			if (current.kind === "placingZone") {
				return {
					...current,
					center: draft.center,
					radiusMeters: draft.radiusMeters,
				};
			}
			if (current.kind === "measure" && current.measure.kind === "radius") {
				return {
					kind: "measure",
					measure: {
						kind: "radius",
						center: draft.center,
						radiusMeters: draft.radiusMeters,
					},
				};
			}
			return current;
		});
	};

	const handleRingDraft = (draft: RingDraft, cause: GestureCause) => {
		if (cause === "tap") webPlatform.haptics.vibrate([10]);
		setTool((current) => {
			if (current.kind === "drawingPolygonConstraint") {
				return { ...current, ring: draft.points };
			}
			if (current.kind === "measure" && current.measure.kind === "path") {
				return {
					kind: "measure",
					measure: { kind: "path", points: draft.points },
				};
			}
			return current;
		});
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

	const commitConstraint = (name: string) => {
		if (!role.teamId || !role.roundId || !hiderTeamId) return;
		const ordinal =
			scopedConstraints.reduce((max, row) => Math.max(max, row.ordinal), -1) +
			1;
		const mode = cut ? "exclude" : "include";
		const label =
			name.trim() ||
			(tool.kind === "pickingBoundaryConstraint"
				? (selectedBoundary?.name ?? null)
				: null);
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
		<Screen
			className={
				tool.kind === "none"
					? undefined
					: "[&_.maplibregl-marker]:pointer-events-none"
			}
			data-testid="play-map"
		>
			<LobbyChrome
				controls={false}
				status={<RoundBar clockOffsetMs={ephemeral.clockOffsetMs} />}
			/>
			<span className="sr-only" data-testid="my-role">
				{role.role ?? "no role"}
			</span>
			{!loaded && (
				<span data-testid="game-not-loaded">Game not loaded yet.</span>
			)}
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

			<div className="relative min-h-0 flex-1 overflow-hidden bg-map-land">
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
						hole={
							searchArea.surviving
								? regionToMultiPolygon(searchArea.surviving)
								: area
						}
					/>
					<BuilderStopsLayer id="play-stops" stops={searchableStops} />
					<SearchZoneLayer zone={zone} />
					<PinLayer
						disabled={tool.kind !== "none"}
						onSelect={(pinId) => {
							setSelectedStopId(null);
							setTool({ kind: "editingPin", pinId });
						}}
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
						<ConstraintDraftLayer
							polygons={selectedBoundary?.polygons ?? null}
						/>
					)}
					{tool.kind === "drawingPolygonConstraint" && (
						<DrawLayer ring={tool.ring} />
					)}
					{tool.kind === "placingZone" && (
						<CircleDraftLayer
							center={tool.center}
							kind="zone"
							radiusMeters={tool.radiusMeters}
						/>
					)}
					<CameraController
						camera={camera}
						fix={ownFix}
						headingDeg={headingDeg}
						onUserGesture={() => setCamera(FREE)}
					/>
					<MapPointerHandler
						mode={pointerMode(tool)}
						onRadiusChange={handleRadiusDraft}
						onRingChange={handleRingDraft}
						onTap={handleTap}
					/>
					<MapFlyTo target={flyTarget} />
					<NorthReset />
					<OwnPosition fix={ownFix} headingDeg={headingDeg} />
					{others.map((player) => (
						<PlayerMarker
							key={player.playerId}
							onSelect={(playerId) => {
								if (tool.kind === "none") {
									setSelectedId(playerId);
									setSelectedStopId(null);
								}
							}}
							player={player}
						/>
					))}
					<MapHud
						blindness={blindnessControl}
						bounds={areaBBox}
						camera={camera}
						canEditConstraints={canEditConstraints}
						defaultRadiusMeters={defaultRadiusMeters}
						hasFix={Boolean(ownFix && ownFix.source !== "unavailable")}
						onCancel={cancelTool}
						onCycleCamera={() => {
							if (!ownFix || ownFix.source === "unavailable") {
								setGpsHelpOpen(true);
								return;
							}
							setCamera((current) => nextCamera(current, hasCompass));
						}}
						onToolChange={changeTool}
						tool={tool}
					/>
				</MapCanvas>

				{status === "unavailable" && (
					<OfflineSurface onRetry={() => setAttempt((n) => n + 1)} />
				)}

				<Surface
					className="absolute top-3 left-3 z-10 max-w-[11rem] px-2 py-1 text-xs"
					raised
				>
					<OwnPositionReadout fix={ownFix} />
					{ownFix && ownFix.source !== "unavailable" && (
						<CoordinateCopy point={[ownFix.lng, ownFix.lat]} />
					)}
				</Surface>
				<div className="absolute inset-x-3 top-28 z-20 mx-auto max-w-xl">
					<ZoneNotice fix={ownFix} role={role} />
				</div>
				<AbsentPlayers players={others} />
				<MapControls blindness={blindnessControl} />
				<div className="pointer-events-none absolute inset-3 z-20 flex items-end justify-between gap-3">
					<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col justify-end">
						{tool.kind === "measure" && (
							<MeasureCard
								onCancel={cancelTool}
								onSeedMeasure={() => {
									if (
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
								onUndoMeasure={() => {
									if (tool.measure.kind !== "path") return;
									setTool({
										kind: "measure",
										measure: {
											kind: "path",
											points: tool.measure.points.slice(0, -1),
										},
									});
								}}
								tool={tool}
							/>
						)}
						{tool.kind === "placingPin" && !draftPoint && <PinPromptCard />}
						{tool.kind === "listingConstraints" && (
							<CutsCard
								constraints={constraintItems}
								onRemove={removeConstraint}
								onRename={renameConstraint}
								onToggle={toggleConstraint}
							/>
						)}
						{canEditConstraints && (
							<MapBar
								canEditConstraints={canEditConstraints}
								cut={cut}
								hiders={hiderTeams}
								onCancel={cancelTool}
								onCommitConstraint={commitConstraint}
								onCutChange={setCut}
								onOpenHiderSheet={() => setHiderSheetOpen(true)}
								onRadiusStep={(direction) => {
									if (tool.kind !== "drawingRadiusConstraint") return;
									setTool({
										...tool,
										radiusMeters: stepZoneMeters(tool.radiusMeters, direction),
									});
								}}
								onSelectBoundary={(id) => {
									if (tool.kind !== "pickingBoundaryConstraint") return;
									setTool({ ...tool, selectedId: id });
								}}
								onUndoPolygonVertex={() => {
									if (tool.kind !== "drawingPolygonConstraint") return;
									setTool({
										kind: "drawingPolygonConstraint",
										ring: tool.ring.slice(0, -1),
									});
								}}
								selectedHiderId={hiderTeamId}
								tool={tool}
							/>
						)}
					</div>
					<div className="pointer-events-auto max-w-sm">
						{tool.kind === "none" && <HidingSheet role={role} />}
						{tool.kind === "none" && (
							<FoundSheet role={role} token={session.token} />
						)}
					</div>
				</div>
			</div>

			<MapToolSheet
				boundaries={visibleBoundaries}
				canPlaceZone={
					role.role === "seeker" &&
					role.teamId !== null &&
					role.roundId !== null
				}
				draftPoint={draftPoint}
				editingPin={editingPin}
				stops={searchableStops}
				onCancel={cancelTool}
				onClearZone={clearZone}
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
				onToolChange={changeTool}
				origin={origin}
				teamColor={myTeam?.color ?? "#0072B2"}
				tool={tool}
			/>
			<GpsHelpSheet
				issue={tracking.locationIssue}
				onClose={() => setGpsHelpOpen(false)}
				open={gpsHelpOpen}
			/>

			<HiderTeamSheet
				hiders={hiderTeams}
				onClose={() => setHiderSheetOpen(false)}
				onSelect={setPickedHiderTeamId}
				open={hiderSheetOpen}
				selectedId={hiderTeamId}
			/>

			<StopSheet
				onClose={() => setSelectedStopId(null)}
				open={selectedStop !== null}
				stop={selectedStop}
			/>
			{selected && (
				<PlayerSheet onClose={() => setSelectedId(null)} player={selected} />
			)}

			<GameTabs code={session.code} />
		</Screen>
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
		<Surface
			className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm"
			data-testid="map-unavailable"
		>
			<p>Map unavailable offline. Your own position is still shown.</p>
			<button
				className="min-h-11 rounded-control border border-hairline bg-surface px-4"
				data-testid="retry-map"
				onClick={onRetry}
				type="button"
			>
				Try again
			</button>
		</Surface>
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
		<Surface
			className="absolute top-16 left-3 z-10 max-w-[11rem] px-2 py-1 text-xs"
			data-testid="absent-players"
			raised
		>
			No position: {absent.map((player) => player.displayName).join(", ")}
		</Surface>
	);
}
