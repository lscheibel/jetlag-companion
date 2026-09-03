import { useQuery, useZero } from "@rocicorp/zero/react";
import {
	buildValidHidingArea,
	expandBBox,
	isPoiKind,
	type ModeId,
	POI_KINDS,
	SCALE_SETTINGS,
} from "@zero-lag/catalog";
import {
	closestSiteRegion,
	isEmptyRegion,
	type LngLat,
	multiPolygonBBox,
	multiPolygonToRegion,
	type Region,
	regionContains,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { type ConstraintGeometry, radiusCenters } from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { Screen } from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FoundCard, SeekerActionsSheet } from "../game/found-sheet";
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
import { CoordinateCopy } from "../map/coordinate-copy";
import type { RadiusDraft, RingDraft } from "../map/draw-gestures";
import { DrawLayer } from "../map/draw-layer";
import { EliminatedLayer } from "../map/eliminated-layer";
import { GameAreaLayer } from "../map/game-area-layer";
import { HidingZoneLayer } from "../map/hiding-zone-layer";
import { MapBar, sheetOwnsBar } from "../map/map-bar";
import { MapCanvas, type MapStatus } from "../map/map-canvas";
import { mapCardMotionProps } from "../map/map-card";
import { MapControls } from "../map/map-controls";
import {
	MapFlyTo,
	MapPointerHandler,
	type PointerMode,
} from "../map/map-interactions";
import {
	ConstraintsPickerSheet,
	CutsCard,
	GpsHelpSheet,
	MeasureCard,
	PinCard,
} from "../map/map-overlay";
import type { GestureCause } from "../map/map-pointer";
import { MapHud } from "../map/map-rail";
import { MapToolSheet } from "../map/map-tool-sheet";
import { MeasureLayer } from "../map/measure-layer";
import { NorthReset } from "../map/north-reset";
import {
	OwnPosition,
	OwnPositionReadout,
	OwnPositionSheet,
} from "../map/own-position";
import { PinDraftMarker, PinLayer } from "../map/pin-layer";
import { PlayerMarker } from "../map/player-marker";
import { PlayerSheet } from "../map/player-sheet";
import { PlayerTrailsLayer } from "../map/player-trails-layer";
import { buildMapPlayers, NO_TEAM_COLOR, visibleMarkers } from "../map/players";
import {
	boardStopModes,
	closestPoiSites,
	DEFAULT_POI_LAYERS,
	ensurePoiType,
	type MapPoi,
	radiusPoiCenters,
	stationPoi,
	stationPois,
	stopIdOfPoi,
	stopsForModes,
} from "../map/poi";
import { PoiLayer } from "../map/poi-layer";
import { PoiPickerSheet } from "../map/poi-picker-sheet";
import { type PoiConstraintKind, PoiSheet } from "../map/poi-sheet";
import { type PoiTypeId, poiTypeLabel } from "../map/poi-type";
import { type PointSources, PointSourcesProvider } from "../map/point-sources";
import { remainingStopCount } from "../map/remaining-stops";
import { SearchZoneLayer } from "../map/search-zone-layer";
import { SplitDraftLayer } from "../map/split-draft-layer";
import { StopSheet } from "../map/stop-sheet";
import {
	BOUNDARY_CONSTRAINT_LEVELS,
	type ConstraintListItem,
	constraintEditTool,
	type MapTool,
	nearestAtPx,
	nearestHitPx,
	PIN_TAP_PX,
	type SearchableStop,
	type SearchResult,
	type SnapTarget,
	STOP_TAP_PX,
	snapToTarget,
	stopPosition,
} from "../map/toolkit";
import { useBlindness } from "../map/use-blindness";
import { boundaryAtPoint, useBoundaries } from "../map/use-boundaries";
import { useCompassHeading } from "../map/use-compass-heading";
import { useNow } from "../map/use-now";
import { usePois } from "../map/use-pois";
import { useWakeLock } from "../map/use-wake-lock";
import { stepZoneMeters } from "../setup/game-size";

/** Berlin, for a map that has nothing else to go on. */
const FALLBACK_CENTER = [13.4132, 52.5219] as const;

function pointerMode(tool: MapTool): PointerMode {
	if (tool.kind === "listingConstraints" || tool.kind === "searching") {
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
	if (tool.kind === "drawingRadiusConstraint") {
		if (tool.poiKind || tool.pickingKind) {
			return { kind: "off" };
		}
		return {
			kind: "radius",
			center: tool.centers[0] ?? null,
			radiusMeters: tool.radiusMeters,
		};
	}
	if (tool.kind === "placingZone") {
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

type FlyTarget =
	| { readonly kind: "point"; readonly point: LngLat }
	| {
			readonly kind: "bounds";
			readonly bounds: readonly [number, number, number, number];
	  };

function storedPolygons(region: Region): [number, number][][][] {
	return regionToMultiPolygon(region).map((polygon) =>
		polygon.map((ring) =>
			ring.map(([lng, lat]) => [lng, lat] as [number, number]),
		),
	);
}

type ConstraintWrite = Parameters<typeof mutators.constraint.createManual>[0];
type ConstraintDraft = Pick<ConstraintWrite, "geometry" | "origin" | "mode">;

/** Where to look to see a cut being reopened. */
function constraintFlyTarget(geometry: ConstraintGeometry): FlyTarget | null {
	if (geometry.kind === "polygon") {
		const box = multiPolygonBBox(geometry.polygons);
		return box ? { kind: "bounds", bounds: box } : null;
	}
	if (geometry.kind === "radius") {
		const center = radiusCenters(geometry)[0];
		return center ? { kind: "point", point: center } : null;
	}
	if (geometry.kind === "halfPlane") {
		return { kind: "point", point: geometry.a };
	}
	return { kind: "point", point: geometry.center };
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
 *
 * That now covers two things rather than one. Markers come from presence;
 * trails come from the durable log, which m2-spec §4 called a replay artifact
 * and which is a live source here. Both are filtered by the same rule in the
 * same two places, and neither is filtered again in this file.
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
	const navigate = useNavigate();
	const reducedMotion = useReducedMotion();
	const cardMotion = mapCardMotionProps(reducedMotion);
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
	const [commitments] = useQuery(queries.commitments());
	const [outcomes] = useQuery(queries.hiderOutcomes());
	// Trails, not replay: the server hands over own team plus — for a hider on a
	// running round — everybody, which is the same set the channel sends live.
	const [positionLog] = useQuery(queries.positionLog());

	const [camera, setCamera] = useState<Camera>(FREE);
	const [status, setStatus] = useState<MapStatus>("loading");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
	const [poiPickerOpen, setPoiPickerOpen] = useState(false);
	const [poiLayers, setPoiLayers] = useState(DEFAULT_POI_LAYERS);
	const [ownSheetOpen, setOwnSheetOpen] = useState(false);
	const [tool, setTool] = useState<MapTool>({ kind: "none" });
	const [draftPoint, setDraftPoint] = useState<LngLat | null>(null);
	const [pinLook, setPinLook] = useState<{
		readonly key: string;
		readonly color: string;
		readonly label: string;
	} | null>(null);
	const [draftRadius, setDraftRadius] = useState<number | null>(null);
	const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
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
	/** Set while a draft is a rewrite of an existing row rather than a new one. */
	const [editingConstraintId, setEditingConstraintId] = useState<string | null>(
		null,
	);
	const [gpsHelpOpen, setGpsHelpOpen] = useState(false);
	const [constraintPickerOpen, setConstraintPickerOpen] = useState(false);
	const [seekerOverlay, setSeekerOverlay] = useState<
		"none" | "actions" | "found"
	>("none");
	const [hidingPick, setHidingPick] = useState<{
		readonly roundId: string;
		readonly stopId: string | null;
	} | null>(null);

	useEffect(() => {
		if (
			tool.kind === "searching" ||
			tool.kind === "measure" ||
			tool.kind === "placingPin" ||
			tool.kind === "editingPin" ||
			tool.kind === "placingZone"
		) {
			setConstraintPickerOpen(false);
		}
	}, [tool.kind]);

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
	/**
	 * The trail set is the marker set, so blindness is one switch rather than
	 * two: a hider who stops seeing a rival's marker stops seeing where it came
	 * from in the same tap. m2-spec §9.
	 *
	 * Your own head is the local watch rather than the copy of it that came back
	 * around through presence — it is fresher, and it is there with the socket
	 * down, which is the same reason your marker is drawn from it. m2-spec §4.
	 *
	 * Its age is the one number the fade is allowed to start from. For everybody
	 * else that is the server-measured staleness §5 already computes; for
	 * yourself it is your own clock minus your own fix, which is one clock and
	 * therefore legal where the general case is not. m0-spec §7.
	 */
	const trailPlayers = shown.map((player) => ({
		playerId: player.playerId,
		color: player.team?.color ?? NO_TEAM_COLOR,
		head: player.isSelf ? ownFix : player.fix,
		headAgeMs: player.isSelf
			? ownFix
				? Math.max(0, now - ownFix.capturedAt)
				: null
			: player.ageMs,
	}));
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
	/**
	 * Station types on this board, and the stops the picker leaves plotted. The
	 * filter is local to this phone: `searchableStops` stays the whole board, so
	 * hiding the buses cannot change what a zone or a constraint is measured
	 * against.
	 */
	const stopModes = useMemo(
		() => boardStopModes(searchableStops),
		[searchableStops],
	);
	const visibleStops = useMemo(
		() => stopsForModes(searchableStops, poiLayers.modes),
		[searchableStops, poiLayers.modes],
	);
	const selectedStop =
		searchableStops.find((stop) => stop.stopId === selectedStopId) ?? null;
	const scalePreset = games[0]?.mapConfig?.scalePreset ?? "city";
	const myTeam = teams.find((team) => team.id === role.teamId);
	const editingPin =
		tool.kind === "editingPin"
			? (pins.find((pin) => pin.id === tool.pinId) ?? null)
			: null;
	const pinDraftKey =
		tool.kind === "editingPin"
			? tool.pinId
			: tool.kind === "placingPin"
				? "new"
				: null;
	const pinPreview =
		pinLook && pinDraftKey !== null && pinLook.key === pinDraftKey
			? pinLook
			: {
					color: editingPin?.color ?? myTeam?.color ?? "#0072B2",
					label: editingPin?.label ?? "",
				};
	const zone = searchZones[0] ?? null;
	const measure = tool.kind === "measure" ? tool.measure : null;
	const fromYou: LngLat | null =
		ownFix && ownFix.source !== "unavailable" ? [ownFix.lng, ownFix.lat] : null;
	const origin: LngLat = fromYou
		? fromYou
		: initialBounds
			? [
					(initialBounds[0] + initialBounds[2]) / 2,
					(initialBounds[1] + initialBounds[3]) / 2,
				]
			: FALLBACK_CENTER;

	const liveRound =
		[...rounds].reverse().find((round) => round.status !== "ended") ?? null;
	/**
	 * Trails are this round's track. Logging follows the round (m2-spec §10), so
	 * a `pending` round has nothing to draw and last round's rows belong to last
	 * round — M14 owns going back to them.
	 */
	const trailRoundId =
		liveRound && liveRound.status !== "pending" ? liveRound.id : null;
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
	const stopsRemaining = remainingStopCount(
		searchableStops,
		searchArea.surviving ?? null,
	);
	/**
	 * Both memoised because the cuts list folds off the back of the list: a fresh
	 * array every render would re-fold every render. `queries.constraints()`
	 * already orders by `ordinal`, which is the order the list shows.
	 */
	const scopedConstraints = useMemo(
		() => constraints.filter((row) => row.hiderTeamId === hiderTeamId),
		[constraints, hiderTeamId],
	);
	const constraintItems: readonly ConstraintListItem[] = useMemo(
		() =>
			scopedConstraints.map((row) => ({
				id: row.id,
				source: row.source,
				mode: row.mode,
				geometry: row.geometry,
				origin: row.origin ?? null,
				enabled: row.enabled,
				name: row.name ?? null,
				createdAt: row.createdAt,
			})),
		[scopedConstraints],
	);
	const canEditConstraints =
		role.role === "seeker" && role.teamId !== null && role.roundId !== null;
	const selectedHiderFound = outcomes.some(
		(outcome) =>
			outcome.roundId === role.roundId &&
			outcome.hiderTeamId === hiderTeamId &&
			outcome.foundAt !== null,
	);
	const isHidingHider = role.role === "hider" && role.roundStatus === "hiding";
	const defaultRadiusMeters = games[0]?.mapConfig?.hidingRadiusMeters ?? 800;
	const hidingCommitment = commitments.find(
		(row) => row.roundId === role.roundId && row.hiderTeamId === role.teamId,
	);
	const hidingPickForRound =
		hidingPick && hidingPick.roundId === role.roundId ? hidingPick : null;
	const hidingDefaultId =
		searchableStops.find((stop) => stop.insideArea)?.stopId ??
		searchableStops[0]?.stopId ??
		null;
	const hidingStopId = isHidingHider
		? hidingPickForRound
			? hidingPickForRound.stopId
			: (hidingCommitment?.stopId ?? hidingDefaultId)
		: (hidingCommitment?.stopId ?? null);
	const hidingStop =
		searchableStops.find((stop) => stop.stopId === hidingStopId) ?? null;
	const committedStop =
		hidingCommitment == null
			? null
			: (searchableStops.find(
					(stop) => stop.stopId === hidingCommitment.stopId,
				) ?? null);
	const previewingOtherZone =
		hidingStop !== null &&
		committedStop !== null &&
		hidingStop.stopId !== committedStop.stopId;

	const pickingLevels =
		tool.kind === "pickingBoundaryConstraint" ? BOUNDARY_CONSTRAINT_LEVELS : [];
	const areaBBox = area ? multiPolygonBBox(area) : null;
	const poiBbox = areaBBox
		? expandBBox(areaBBox, SCALE_SETTINGS[scalePreset].marginMeters)
		: null;
	/**
	 * A card with a point in it can pick a place, so the amenities have to be in
	 * hand before its sheet opens rather than after — which is why the pin,
	 * measure and cut tools ask for them alongside the two POI tools.
	 */
	const pointPickingTool =
		tool.kind === "placingPin" ||
		tool.kind === "editingPin" ||
		tool.kind === "measure" ||
		tool.kind === "drawingSplitConstraint";
	const catalogPois = usePois(
		session,
		poiBbox,
		poiLayers.kinds.length > 0 ||
			pointPickingTool ||
			tool.kind === "pickingClosestPoiConstraint" ||
			tool.kind === "drawingRadiusConstraint",
	);
	const allPois = useMemo<readonly MapPoi[]>(() => {
		const region = area ? multiPolygonToRegion(area) : null;
		const out: MapPoi[] = [];
		for (const row of catalogPois) {
			if (!isPoiKind(row.kind)) continue;
			out.push({
				id: row.id,
				name: row.name,
				kind: row.kind,
				lng: row.lng,
				lat: row.lat,
				insideArea: region ? regionContains(region, [row.lng, row.lat]) : true,
			});
		}
		return out;
	}, [catalogPois, area]);
	/**
	 * Everything a constraint can be aimed at: amenity pins and station pins in
	 * one pool, because the nearest-cell and all-of-this-type tools ask the same
	 * question of both. Stations are still *drawn* by the stop layer.
	 */
	const pickablePois = useMemo<readonly MapPoi[]>(
		() => [...allPois, ...stationPois(searchableStops)],
		[allPois, searchableStops],
	);
	const poiTypes = useMemo<readonly PoiTypeId[]>(
		() => [...stopModes, ...POI_KINDS],
		[stopModes],
	);
	/**
	 * What every point picker on this screen can copy a coordinate out of. The
	 * hiding stop is the committed one and nothing else: a seeker has no
	 * commitment to find, and a hider still turning one over has not made one.
	 */
	const pointSources: PointSources = {
		fix:
			ownFix && ownFix.source !== "unavailable"
				? {
						point: [ownFix.lng, ownFix.lat],
						accuracyMeters: ownFix.accuracyMeters,
						capturedAt: ownFix.capturedAt,
					}
				: null,
		pins,
		places: pickablePois,
		placeTypes: poiTypes,
		hidingZoneStop: committedStop
			? { name: committedStop.name, point: stopPosition(committedStop) }
			: null,
		origin,
		area: areaBBox,
	};
	const visiblePois = useMemo<readonly MapPoi[]>(() => {
		const wanted = new Set<string>(poiLayers.kinds);
		return allPois.filter((poi) => wanted.has(poi.kind));
	}, [allPois, poiLayers.kinds]);
	const selectedPoi =
		visiblePois.find((poi) => poi.id === selectedPoiId) ?? null;
	const selectedClosestPoi =
		tool.kind === "pickingClosestPoiConstraint" && tool.selectedId
			? (pickablePois.find((poi) => poi.id === tool.selectedId) ?? null)
			: null;
	/**
	 * The station drawn in hand: the one whose sheet is open, or the station a
	 * nearest-cell draft is measured from. Only the first is a hiding-zone
	 * question, so only the first draws the zone circle.
	 */
	const highlightedStopId =
		selectedStopId ??
		(selectedClosestPoi ? stopIdOfPoi(selectedClosestPoi) : null);
	const closestDraftRegion = useMemo(() => {
		if (tool.kind !== "pickingClosestPoiConstraint" || !selectedClosestPoi) {
			return null;
		}
		const { others } = closestPoiSites(selectedClosestPoi, pickablePois);
		const clip = area ? multiPolygonToRegion(area) : undefined;
		return closestSiteRegion(
			[selectedClosestPoi.lng, selectedClosestPoi.lat],
			others.map((poi) => [poi.lng, poi.lat] as const),
			{ clip },
		);
	}, [tool, selectedClosestPoi, pickablePois, area]);
	const radiusDraftCenters = useMemo(() => {
		if (tool.kind !== "drawingRadiusConstraint") return [];
		if (tool.poiKind) return radiusPoiCenters(tool.poiKind, pickablePois);
		return tool.centers;
	}, [tool, pickablePois]);
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
		setEditingConstraintId(null);
		setDraftPoint(null);
		setDraftRadius(null);
		setConstraintPickerOpen(false);
		setSeekerOverlay("none");
	};

	const changeTool = (next: MapTool, editingId: string | null = null) => {
		if (next.kind === "placingPin") {
			if (
				tool.kind === "measure" &&
				tool.measure.kind === "radius" &&
				tool.measure.center
			) {
				setDraftPoint(tool.measure.center);
				setDraftRadius(tool.measure.radiusMeters);
			} else if (tool.kind !== "editingPin") {
				setDraftPoint(null);
				setDraftRadius(null);
			}
		}
		if (next.kind !== "none") {
			setSelectedStopId(null);
			setSelectedPoiId(null);
			setPoiPickerOpen(false);
			setSeekerOverlay("none");
			setOwnSheetOpen(false);
		}
		if (next.kind === "drawingSplitConstraint") setCut(false);
		if (next.kind === "pickingClosestPoiConstraint" && next.filterKind) {
			const kind = next.filterKind;
			setPoiLayers((current) => ensurePoiType(current, kind));
		}
		if (next.kind === "drawingRadiusConstraint" && next.poiKind) {
			const kind = next.poiKind;
			setPoiLayers((current) => ensurePoiType(current, kind));
		}
		/*
		 * Reaching for a different tool abandons the cut being edited: the next
		 * commit is a new one. A tool changing its own state — the boundary
		 * sheet's levels, "pick another" — is the same draft, and keeps it.
		 */
		if (next.kind !== tool.kind) setEditingConstraintId(editingId);
		setTool(next);
	};

	const addPoiConstraint = (poi: MapPoi, kind: PoiConstraintKind) => {
		if (kind === "circle") {
			changeTool({
				kind: "drawingRadiusConstraint",
				centers: [[poi.lng, poi.lat]],
				radiusMeters: defaultRadiusMeters,
				poiKind: null,
				pickingKind: false,
			});
			return;
		}
		changeTool({
			kind: "pickingClosestPoiConstraint",
			filterKind: poi.kind,
			selectedId: poi.id,
		});
	};

	/**
	 * The station sheet offers the same two shapes as the amenity sheet. A
	 * circle is about the point and needs no type; a nearest cell is about one
	 * station type, which is why the sheet names which.
	 */
	const addStopConstraint = (
		stop: SearchableStop,
		kind: PoiConstraintKind,
		modeId: ModeId | null,
	) => {
		if (kind === "nearest" && modeId) {
			addPoiConstraint(stationPoi(stop, modeId), kind);
			return;
		}
		changeTool({
			kind: "drawingRadiusConstraint",
			centers: [[stop.lng, stop.lat]],
			radiusMeters: defaultRadiusMeters,
			poiKind: null,
			pickingKind: false,
		});
	};

	const selectPin = (pinId: string) => {
		const pin = pins.find((row) => row.id === pinId);
		setSelectedStopId(null);
		setSelectedPoiId(null);
		setSelectedId(null);
		setOwnSheetOpen(false);
		setDraftPoint(pin ? [pin.lng, pin.lat] : null);
		setTool({ kind: "editingPin", pinId });
	};

	const handleTap = (
		point: LngLat,
		project: (lngLat: LngLat) => { x: number; y: number },
		screen: { x: number; y: number },
	) => {
		if (tool.kind === "listingConstraints" || tool.kind === "searching") {
			return;
		}
		if (tool.kind === "none") {
			if (!isHidingHider) {
				const ownHit =
					ownFix && ownFix.source !== "unavailable"
						? nearestAtPx(
								[ownFix],
								screen,
								(fix) => [fix.lng, fix.lat],
								project,
								STOP_TAP_PX,
							)
						: null;
				if (ownHit) {
					setOwnSheetOpen(true);
					setSelectedStopId(null);
					setSelectedPoiId(null);
					setSelectedId(null);
					return;
				}
				const pinHit = nearestAtPx(
					pins,
					screen,
					(pin) => [pin.lng, pin.lat],
					project,
					PIN_TAP_PX,
				);
				if (pinHit) {
					selectPin(pinHit.id);
					return;
				}
			}
			const tapPx = isHidingHider ? 36 : STOP_TAP_PX;
			const stopHit =
				visibleStops.length > 0
					? nearestHitPx(
							visibleStops,
							screen,
							(stop) => [stop.lng, stop.lat],
							project,
							tapPx,
						)
					: null;
			const poiHit =
				!isHidingHider && visiblePois.length > 0
					? nearestHitPx(
							visiblePois,
							screen,
							(poi) => [poi.lng, poi.lat],
							project,
							tapPx,
						)
					: null;
			const hitStop =
				stopHit && (!poiHit || stopHit.dist <= poiHit.dist)
					? stopHit.item
					: null;
			const hitPoi =
				poiHit && (!stopHit || poiHit.dist < stopHit.dist) ? poiHit.item : null;
			if (isHidingHider) {
				if (hitStop) {
					webPlatform.haptics.vibrate([10]);
					setHidingPick(
						role.roundId
							? { roundId: role.roundId, stopId: hitStop.stopId }
							: null,
					);
				} else if (role.roundId) {
					webPlatform.haptics.vibrate([10]);
					setHidingPick({ roundId: role.roundId, stopId: null });
				}
				return;
			}
			setSelectedStopId(hitStop?.stopId ?? null);
			setSelectedPoiId(hitPoi?.id ?? null);
			setOwnSheetOpen(false);
			if (hitStop || hitPoi) setSelectedId(null);
			return;
		}
		webPlatform.haptics.vibrate([10]);
		if (tool.kind === "placingPin" || tool.kind === "editingPin") {
			const pinHit = nearestAtPx(
				pins,
				screen,
				(pin) => [pin.lng, pin.lat],
				project,
				PIN_TAP_PX,
			);
			if (pinHit) {
				if (tool.kind === "editingPin" && pinHit.id === tool.pinId) return;
				selectPin(pinHit.id);
				return;
			}
			setDraftPoint(point);
			return;
		}
		if (tool.kind === "drawingSplitConstraint") {
			if (tool.focus === "from") {
				setTool({
					...tool,
					from: point,
					focus: tool.to ? "from" : "to",
				});
			} else {
				setTool({ ...tool, to: point });
			}
			return;
		}
		if (tool.kind === "pickingBoundaryConstraint") {
			const hit = boundaryAtPoint(visibleBoundaries, point);
			if (!hit) return;
			setTool({ ...tool, selectedId: hit.id });
			const box = multiPolygonBBox(hit.polygons);
			if (box) setFlyTarget({ kind: "bounds", bounds: box });
			return;
		}
		if (tool.kind === "pickingClosestPoiConstraint") {
			const candidates = tool.filterKind
				? pickablePois.filter((poi) => poi.kind === tool.filterKind)
				: pickablePois;
			const hit = nearestHitPx(
				candidates,
				screen,
				(poi) => [poi.lng, poi.lat],
				project,
				STOP_TAP_PX,
			);
			if (!hit) return;
			webPlatform.haptics.vibrate([10]);
			setPoiLayers((current) => ensurePoiType(current, hit.item.kind));
			setTool({
				...tool,
				filterKind: hit.item.kind,
				selectedId: hit.item.id,
			});
		}
	};

	/**
	 * What a measure tap can land on rather than beside, built at the moment of
	 * the tap: only what the map is currently drawing, because a marker you
	 * cannot see is not one you meant to hit.
	 */
	const measureSnapTargets = (): readonly SnapTarget[] => {
		const targets: SnapTarget[] = [];
		for (const stop of visibleStops) {
			targets.push({ point: [stop.lng, stop.lat], maxPx: STOP_TAP_PX });
		}
		for (const poi of visiblePois) {
			targets.push({ point: [poi.lng, poi.lat], maxPx: STOP_TAP_PX });
		}
		for (const pin of pins) {
			targets.push({ point: [pin.lng, pin.lat], maxPx: PIN_TAP_PX });
		}
		if (fromYou) targets.push({ point: fromYou, maxPx: STOP_TAP_PX });
		for (const player of others) {
			if (!player.fix) continue;
			targets.push({
				point: [player.fix.lng, player.fix.lat],
				maxPx: STOP_TAP_PX,
			});
		}
		return targets;
	};

	/**
	 * Measuring to a station is measuring to the station, not to wherever the
	 * finger covered it. Only the measure tool snaps, and only when placing a
	 * new vertex — a vertex being dragged stays where it is put.
	 */
	const snapMeasureTap = (
		point: LngLat,
		project: (lngLat: LngLat) => { x: number; y: number },
		screen: { x: number; y: number },
	): LngLat => {
		if (tool.kind !== "measure") return point;
		return snapToTarget(measureSnapTargets(), screen, project) ?? point;
	};

	const handleRadiusDraft = (draft: RadiusDraft, cause: GestureCause) => {
		if (cause === "tap") webPlatform.haptics.vibrate([10]);
		setTool((current) => {
			if (current.kind === "drawingRadiusConstraint") {
				if (current.poiKind) return current;
				return {
					...current,
					centers: draft.center ? [draft.center] : [],
					poiKind: null,
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
		setSelectedStopId(result.stop.stopId);
		setSelectedPoiId(null);
		setSelectedId(null);
		setOwnSheetOpen(false);
		setTool({ kind: "none" });
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
		lng: number;
		lat: number;
	}) => {
		if (!role.teamId) return;
		if (editingPin) {
			void zero.mutate(
				mutators.pin.update({
					...event(),
					pinId: editingPin.id,
					label: input.label,
					note: input.note,
					color: input.color,
					radiusMeters: input.radiusMeters,
					lng: input.lng,
					lat: input.lat,
				}),
			);
		} else {
			void zero.mutate(
				mutators.pin.create({
					...event(),
					pinId: crypto.randomUUID(),
					teamId: role.teamId,
					roundId: role.roundId,
					lng: input.lng,
					lat: input.lat,
					label: input.label,
					note: input.note,
					color: input.color,
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

	/**
	 * What the fold sees, and the tool state that produced it. The two are
	 * written together: `geometry` is deliberately lossy about its author — a
	 * Bezirk, a drawn ring and a nearest cell are all one `polygon` — so the
	 * tool's own state rides along, and the row can be reopened in the tool
	 * that drew it rather than in a guess at it.
	 */
	const constraintDraft = (): ConstraintDraft | null => {
		const mode = cut ? "exclude" : "include";
		if (
			tool.kind === "drawingRadiusConstraint" &&
			radiusDraftCenters.length > 0
		) {
			return {
				geometry: {
					kind: "radius",
					centers: radiusDraftCenters.map(
						(center) => [center[0], center[1]] as [number, number],
					),
					radius: tool.radiusMeters,
				},
				origin: {
					tool: "drawingRadiusConstraint",
					centers: tool.centers.map(
						(center) => [center[0], center[1]] as [number, number],
					),
					radiusMeters: tool.radiusMeters,
					poiKind: tool.poiKind,
				},
				mode,
			};
		}
		if (tool.kind === "drawingPolygonConstraint" && tool.ring.length >= 3) {
			const region = buildValidHidingArea(tool.ring);
			if (isEmptyRegion(region)) return null;
			return {
				geometry: { kind: "polygon", polygons: storedPolygons(region) },
				origin: {
					tool: "drawingPolygonConstraint",
					ring: tool.ring.map(
						(point) => [point[0], point[1]] as [number, number],
					),
				},
				mode,
			};
		}
		if (tool.kind === "pickingBoundaryConstraint" && selectedBoundary) {
			return {
				geometry: {
					kind: "polygon",
					polygons: selectedBoundary.polygons.map((polygon) =>
						polygon.map((ring) =>
							ring.map(([lng, lat]) => [lng, lat] as [number, number]),
						),
					),
				},
				origin: {
					tool: "pickingBoundaryConstraint",
					boundaryId: selectedBoundary.id,
				},
				mode,
			};
		}
		if (tool.kind === "drawingSplitConstraint" && tool.from && tool.to) {
			return {
				geometry: {
					kind: "halfPlane",
					a: [tool.from[0], tool.from[1]],
					b: [tool.to[0], tool.to[1]],
					nearer: cut ? "b" : "a",
				},
				origin: {
					tool: "drawingSplitConstraint",
					from: [tool.from[0], tool.from[1]],
					to: [tool.to[0], tool.to[1]],
				},
				// A split always cuts; the pair picks which side falls away.
				mode: "exclude",
			};
		}
		if (
			tool.kind === "pickingClosestPoiConstraint" &&
			selectedClosestPoi &&
			closestDraftRegion &&
			!isEmptyRegion(closestDraftRegion)
		) {
			return {
				geometry: {
					kind: "polygon",
					polygons: storedPolygons(closestDraftRegion),
				},
				origin: {
					tool: "pickingClosestPoiConstraint",
					poiId: selectedClosestPoi.id,
					filterKind: tool.filterKind,
					// The nearest tool always takes the whole cell.
					radiusMeters: null,
				},
				mode,
			};
		}
		return null;
	};

	const commitConstraint = (name: string) => {
		if (!role.teamId || !role.roundId || !hiderTeamId) return;
		const draft = constraintDraft();
		if (!draft) return;
		const label =
			name.trim() ||
			(tool.kind === "pickingBoundaryConstraint"
				? (selectedBoundary?.name ?? null)
				: tool.kind === "pickingClosestPoiConstraint"
					? (selectedClosestPoi?.name ?? null)
					: tool.kind === "drawingRadiusConstraint" && tool.poiKind
						? poiTypeLabel(tool.poiKind)
						: null);
		if (editingConstraintId) {
			void zero.mutate(
				mutators.constraint.editManual({
					...event(),
					constraintId: editingConstraintId,
					geometry: draft.geometry,
					origin: draft.origin,
					mode: draft.mode,
					name: label,
				}),
			);
		} else {
			const ordinal =
				scopedConstraints.reduce((max, row) => Math.max(max, row.ordinal), -1) +
				1;
			void zero.mutate(
				mutators.constraint.createManual({
					...event(),
					constraintId: crypto.randomUUID(),
					roundId: role.roundId,
					seekerTeamId: role.teamId,
					hiderTeamId,
					geometry: draft.geometry,
					origin: draft.origin,
					mode: draft.mode,
					ordinal,
					name: label,
				}),
			);
		}
		webPlatform.haptics.vibrate([15]);
		cancelTool();
	};

	const editingConstraint = editingConstraintId
		? {
				id: editingConstraintId,
				name:
					constraintItems.find((item) => item.id === editingConstraintId)
						?.name ?? "",
			}
		: null;

	/**
	 * The list's edit: put the tool back the way it was left, and fly to what it
	 * draws, since the cut being edited need not be on screen.
	 */
	const editConstraint = (id: string) => {
		const row = constraintItems.find((item) => item.id === id);
		const edit = row ? constraintEditTool(row) : null;
		if (!row || !edit) return;
		changeTool(edit.tool, id);
		setCut(edit.cut);
		const target = constraintFlyTarget(row.geometry);
		if (target) setFlyTarget(target);
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

	const canSuspectHidingZone =
		canEditConstraints &&
		role.roundStatus === "seeking" &&
		hiderTeamId !== null;

	const suspectHidingZone = (stop: SearchableStop) => {
		if (!role.teamId || !role.roundId || !hiderTeamId) return;
		void zero.mutate(
			mutators.constraint.suspectHidingZone({
				...event(),
				constraintId: crypto.randomUUID(),
				roundId: role.roundId,
				seekerTeamId: role.teamId,
				hiderTeamId,
				lng: stop.lng,
				lat: stop.lat,
				radiusMeters: defaultRadiusMeters,
				name: stop.name.slice(0, 80),
			}),
		);
		webPlatform.haptics.vibrate([15]);
		setSelectedStopId(null);
	};

	const map = (
		<Screen
			className={
				tool.kind === "none"
					? undefined
					: "[&_.maplibregl-marker]:pointer-events-none"
			}
			data-testid="play-map"
		>
			<LobbyChrome controls={false} status={<RoundBar />} />
			<span className="sr-only" data-testid="my-role">
				{role.role ?? "no role"}
			</span>
			{!loaded && (
				<p
					className="px-4 pb-2 text-ink-dim text-sm"
					data-testid="game-not-loaded"
				>
					Game not loaded yet.
				</p>
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
					{role.role === "hider" && committedStop && (
						<HidingZoneLayer
							center={[committedStop.lng, committedStop.lat]}
							committed
							id="hiding-zone-committed"
							muted={previewingOtherZone}
							radiusMeters={defaultRadiusMeters}
						/>
					)}
					{role.role === "hider" &&
						hidingStop &&
						(previewingOtherZone || !committedStop) && (
							<HidingZoneLayer
								center={[hidingStop.lng, hidingStop.lat]}
								radiusMeters={defaultRadiusMeters}
							/>
						)}
					<BuilderStopsLayer
						area={area}
						fold={
							role.role === "seeker" ? (searchArea.surviving ?? null) : null
						}
						id="play-stops"
						selectedId={highlightedStopId}
						stops={visibleStops}
						zoneRadiusMeters={selectedStopId ? defaultRadiusMeters : null}
					/>
					<PoiLayer
						area={area}
						pois={visiblePois}
						selectedId={
							tool.kind === "pickingClosestPoiConstraint"
								? tool.selectedId
								: selectedPoiId
						}
					/>
					<SearchZoneLayer zone={zone} />
					<PinLayer
						disabled={tool.kind !== "none" || isHidingHider}
						omitId={editingPin?.id}
						onSelect={selectPin}
						pins={pins}
					/>
					{(tool.kind === "placingPin" || tool.kind === "editingPin") &&
						draftPoint && (
							<PinDraftMarker
								color={pinPreview.color}
								label={pinPreview.label}
								point={draftPoint}
							/>
						)}
					<MeasureLayer measure={measure} />
					{tool.kind === "drawingRadiusConstraint" && (
						<ConstraintDraftLayer
							centers={radiusDraftCenters}
							radiusMeters={tool.radiusMeters}
						/>
					)}
					{tool.kind === "pickingBoundaryConstraint" && (
						<ConstraintDraftLayer
							polygons={selectedBoundary?.polygons ?? null}
						/>
					)}
					{tool.kind === "pickingClosestPoiConstraint" &&
						closestDraftRegion && (
							<ConstraintDraftLayer
								polygons={regionToMultiPolygon(closestDraftRegion)}
							/>
						)}
					{tool.kind === "drawingPolygonConstraint" && (
						<DrawLayer ring={tool.ring} />
					)}
					{tool.kind === "drawingSplitConstraint" && (
						<SplitDraftLayer
							excludeNearer={cut ? "b" : "a"}
							focus={tool.focus}
							from={tool.from}
							onFocus={(which) => setTool({ ...tool, focus: which })}
							surviving={searchArea.surviving}
							to={tool.to}
						/>
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
						onSnapTap={snapMeasureTap}
						onTap={handleTap}
					/>
					<MapFlyTo target={flyTarget} />
					<NorthReset />
					<PlayerTrailsLayer
						players={trailPlayers}
						roundId={trailRoundId}
						rows={positionLog}
					/>
					<OwnPosition
						fix={ownFix}
						headingDeg={headingDeg}
						onSelect={() => {
							if (tool.kind !== "none") return;
							setOwnSheetOpen(true);
							setSelectedStopId(null);
							setSelectedPoiId(null);
							setSelectedId(null);
						}}
					/>
					{others.map((player) => (
						<PlayerMarker
							key={player.playerId}
							onSelect={(playerId) => {
								if (tool.kind === "none") {
									setSelectedId(playerId);
									setSelectedStopId(null);
									setSelectedPoiId(null);
									setOwnSheetOpen(false);
								}
							}}
							player={player}
						/>
					))}
					<MapHud
						blindness={blindnessControl}
						bounds={areaBBox}
						camera={camera}
						hasFix={Boolean(ownFix && ownFix.source !== "unavailable")}
						onCancel={cancelTool}
						onCycleCamera={() => {
							if (!ownFix || ownFix.source === "unavailable") {
								setGpsHelpOpen(true);
								return;
							}
							setCamera((current) => nextCamera(current, hasCompass));
						}}
						onPoiPicker={() => {
							setPoiPickerOpen((open) => !open);
							setSelectedStopId(null);
							setSelectedPoiId(null);
						}}
						onToolChange={changeTool}
						playTools={!isHidingHider}
						poiPickerOpen={poiPickerOpen}
						tool={tool}
					/>
				</MapCanvas>

				{status === "unavailable" && (
					<OfflineSurface onRetry={() => setAttempt((n) => n + 1)} />
				)}

				{status === "unavailable" &&
					ownFix &&
					ownFix.source !== "unavailable" && (
						<Surface
							className="absolute top-3 left-3 z-10 max-w-[11rem] px-2 py-1 text-xs"
							raised
						>
							<OwnPositionReadout fix={ownFix} />
							<CoordinateCopy
								point={[ownFix.lng, ownFix.lat]}
								testId="own-readout-coordinates"
							/>
						</Surface>
					)}
				<div className="absolute inset-x-3 top-28 z-20 mx-auto max-w-xl">
					<ZoneNotice fix={ownFix} role={role} />
				</div>
				<MapControls blindness={blindnessControl} />
				<div className="pointer-events-none absolute inset-x-3 top-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex items-end justify-between gap-3">
					<div className="relative h-full min-h-0 min-w-0 flex-1">
						<AnimatePresence>
							{tool.kind === "measure" && (
								<motion.div key="measure" {...cardMotion}>
									<MeasureCard
										fromYou={fromYou}
										onAddPoint={(point) => {
											if (tool.measure.kind !== "path") return;
											setTool({
												kind: "measure",
												measure: {
													kind: "path",
													points: [...tool.measure.points, point],
												},
											});
										}}
										onCancel={cancelTool}
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
								</motion.div>
							)}
							{(tool.kind === "placingPin" || tool.kind === "editingPin") && (
								<motion.div key={editingPin?.id ?? "pin-new"} {...cardMotion}>
									<PinCard
										draftPoint={draftPoint}
										onCancel={cancelTool}
										onDelete={
											editingPin
												? () => {
														void zero.mutate(
															mutators.pin.delete({
																...event(),
																pinId: editingPin.id,
															}),
														);
														cancelTool();
													}
												: null
										}
										onDraftPoint={setDraftPoint}
										onLook={({ color, label }) => {
											if (pinDraftKey === null) return;
											setPinLook({ key: pinDraftKey, color, label });
										}}
										onSave={savePin}
										pin={editingPin}
										teamColor={myTeam?.color ?? "#0072B2"}
									/>
								</motion.div>
							)}
							{tool.kind === "listingConstraints" && (
								<motion.div key="cuts" {...cardMotion}>
									<CutsCard
										constraints={constraintItems}
										onClose={cancelTool}
										onEdit={editConstraint}
										onRemove={removeConstraint}
										onRename={renameConstraint}
										onToggle={toggleConstraint}
										seed={games[0]?.mapConfig?.validHidingArea ?? null}
										stopsRemaining={stopsRemaining}
									/>
								</motion.div>
							)}
							{tool.kind === "none" && isHidingHider && (
								<motion.div key="hiding" {...cardMotion}>
									<HidingSheet
										radiusMeters={defaultRadiusMeters}
										role={role}
										selectedStop={hidingStop}
									/>
								</motion.div>
							)}
							{seekerOverlay === "found" && (
								<motion.div key="found" {...cardMotion}>
									<FoundCard
										hiderTeamId={hiderTeamId}
										onCancel={() => setSeekerOverlay("none")}
										role={role}
										token={session.token}
									/>
								</motion.div>
							)}
							{canEditConstraints &&
								seekerOverlay !== "found" &&
								!sheetOwnsBar(tool) && (
									<motion.div key="bar" {...cardMotion}>
										<MapBar
											canEditConstraints={canEditConstraints}
											cut={cut}
											editing={editingConstraint}
											hiders={hiderTeams}
											onActions={() =>
												setSeekerOverlay((current) =>
													current === "actions" ? "none" : "actions",
												)
											}
											onCancel={cancelTool}
											onCommitConstraint={commitConstraint}
											onCutChange={setCut}
											onOpenHiderSheet={() => setHiderSheetOpen(true)}
											onRadiusStep={(direction) => {
												if (tool.kind !== "drawingRadiusConstraint") return;
												setTool({
													...tool,
													radiusMeters: stepZoneMeters(
														tool.radiusMeters,
														direction,
													),
												});
											}}
											onSelectBoundary={(id) => {
												if (tool.kind !== "pickingBoundaryConstraint") return;
												setTool({ ...tool, selectedId: id });
											}}
											onSplitChange={setTool}
											onRadiusChange={setTool}
											onClosestPoiChange={setTool}
											radiusCenters={radiusDraftCenters}
											remainingStopCount={stopsRemaining}
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
									</motion.div>
								)}
						</AnimatePresence>
					</div>
				</div>
			</div>

			{canEditConstraints && (
				<SeekerActionsSheet
					canAsk={role.roundStatus === "seeking"}
					canMarkFound={role.roundStatus === "seeking"}
					found={selectedHiderFound}
					onClose={() => setSeekerOverlay("none")}
					onFoundThem={() => setSeekerOverlay("found")}
					onAsk={() => {
						setSeekerOverlay("none");
						void navigate(`/g/${session.code}/ask`);
					}}
					onNarrowDown={() => {
						setSeekerOverlay("none");
						setConstraintPickerOpen(true);
					}}
					onUndoFound={() => {
						if (!role.roundId || !hiderTeamId) return;
						void zero.mutate(
							mutators.round.unmarkFound({
								eventId: crypto.randomUUID(),
								roundId: role.roundId,
								hiderTeamId,
							}),
						);
						setSeekerOverlay("none");
					}}
					open={seekerOverlay === "actions"}
				/>
			)}
			{canEditConstraints && (
				<ConstraintsPickerSheet
					current={tool}
					defaultRadiusMeters={defaultRadiusMeters}
					onClose={() => setConstraintPickerOpen(false)}
					onPick={(next) => {
						setConstraintPickerOpen(false);
						if (tool.kind === next.kind) cancelTool();
						else changeTool(next);
					}}
					open={constraintPickerOpen}
				/>
			)}
			<MapToolSheet
				boundaries={visibleBoundaries}
				canPlaceZone={
					role.role === "seeker" &&
					role.teamId !== null &&
					role.roundId !== null
				}
				stops={searchableStops}
				poiTypes={poiTypes}
				pois={pickablePois}
				onCancel={cancelTool}
				onClearZone={clearZone}
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
				fromYou={fromYou !== null}
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

			<PoiPickerSheet
				layers={poiLayers}
				modes={stopModes}
				onChange={setPoiLayers}
				onClose={() => setPoiPickerOpen(false)}
				open={poiPickerOpen}
			/>
			<StopSheet
				fromYou={fromYou}
				onAddConstraint={canEditConstraints ? addStopConstraint : undefined}
				onClose={() => setSelectedStopId(null)}
				onSuspectHidingZone={
					canSuspectHidingZone ? suspectHidingZone : undefined
				}
				open={selectedStop !== null}
				stop={selectedStop}
			/>
			<PoiSheet
				fromYou={fromYou}
				onAddConstraint={canEditConstraints ? addPoiConstraint : undefined}
				onClose={() => setSelectedPoiId(null)}
				open={selectedPoi !== null}
				poi={selectedPoi}
			/>
			<OwnPositionSheet
				fix={ownFix}
				onClose={() => setOwnSheetOpen(false)}
				open={ownSheetOpen}
			/>
			{selected && (
				<PlayerSheet onClose={() => setSelectedId(null)} player={selected} />
			)}
		</Screen>
	);

	return (
		<PointSourcesProvider value={pointSources}>{map}</PointSourcesProvider>
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
