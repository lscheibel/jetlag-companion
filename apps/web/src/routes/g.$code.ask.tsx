import { useQuery } from "@rocicorp/zero/react";
import {
	expandBBox,
	isPoiKind,
	POI_KINDS,
	SCALE_SETTINGS,
} from "@zero-lag/catalog";
import {
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	multiPolygonToRegion,
	regionContains,
} from "@zero-lag/geo";
import {
	familyOptions,
	type QuestionFamilyId,
	questionFamily,
} from "@zero-lag/rules";
import { fixToLngLat, queries, type ScalePreset } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { useMyRole } from "../game/use-role";
import { HeaderAction } from "../lobby/lobby-header";
import { boardStopModes, type MapPoi, stationPois } from "../map/poi";
import type { PoiTypeId } from "../map/poi-type";
import { type PointSources, PointSourcesProvider } from "../map/point-sources";
import type { SearchableStop } from "../map/toolkit";
import { usePois } from "../map/use-pois";
import { QuestionBoard } from "../questions/board";
import { QuestionCardSheet, type QuestionPick } from "../questions/card-sheet";
import { FAMILY_LOOK } from "../questions/family-look";
import { FamilySheet } from "../questions/family-sheet";
import { QuestionSearch } from "../questions/search";
import type { Session } from "../session";
import {
	formatZone,
	gameSizeFromScalePreset,
	parseZoneMeters,
} from "../setup/game-size";

/**
 * What there is to ask.
 *
 * A screen rather than a sheet over the map: the board gets the whole width,
 * because picking a blank is the constant act and switching family is the rare
 * one. The family is therefore a word in the app bar with a caret behind it,
 * not a rail of six abbreviations across the top.
 *
 * Nothing here spends a question. M6 owns the ask mutation; until it lands the
 * card's Send is inert and the way a question actually reaches a hider is the
 * copy button beside it.
 */
type View =
	| {
			readonly kind: "board";
			readonly familyId: QuestionFamilyId;
			readonly optionId: string | null;
			/** Raw text for the one option that is typed rather than picked. */
			readonly custom: string;
	  }
	| {
			readonly kind: "search";
			readonly query: string;
			readonly from: QuestionFamilyId;
	  };

export default function AskRoute() {
	const navigate = useNavigate();
	const { session, tracking } = useGameShell();
	const role = useMyRole(session.playerId);
	const [games] = useQuery(queries.game());
	const [teams] = useQuery(queries.teams());
	const [pins] = useQuery(queries.pins());
	const [mapStops] = useQuery(queries.mapStops());

	const [view, setView] = useState<View>({
		kind: "board",
		familyId: "radar",
		optionId: null,
		custom: "",
	});
	const [familySheetOpen, setFamilySheetOpen] = useState(false);
	const [card, setCard] = useState<QuestionPick | null>(null);
	/**
	 * Null while the phone's own fix is the answer, which it usually is. Kept as
	 * an override rather than seeded from the fix and then synced: a point that
	 * starts as a copy of the fix stops following it the moment the fix moves,
	 * and nobody asked it to.
	 */
	const [chosenPoint, setChosenPoint] = useState<LngLat | null>(null);

	/**
	 * The board's size comes off the map's scale preset rather than off the S/M/L
	 * the host tapped in setup: the preset is what the area actually recorded,
	 * and the size button was only a prefill on top of it.
	 */
	const size = gameSizeFromScalePreset(
		games[0]?.mapConfig?.scalePreset ?? "city",
	);
	const hider = teams.find((team) => team.id !== role.teamId);
	const familyId = view.kind === "board" ? view.familyId : view.from;
	const family = questionFamily(familyId);
	const picked =
		view.kind === "board" && view.optionId !== null
			? (familyOptions(family).find((option) => option.id === view.optionId) ??
				null)
			: null;

	const fix = tracking.lastFix;
	const fixPoint = fix ? fixToLngLat(fix) : null;
	const point = chosenPoint ?? fixPoint;

	/**
	 * Radar's free rung, read back. `parseZoneMeters` is the host's own radius
	 * parser, so "750", "750 m" and "2 km" all land the same way here as they do
	 * in setup — and `formatZone` writes it into the sentence the way the rest
	 * of the app writes a distance.
	 */
	const custom = view.kind === "board" ? view.custom : "";
	const customMeters = parseZoneMeters(custom);
	const customText =
		customMeters === null ? undefined : formatZone(customMeters);
	/** A typed option that has not been typed yet is not a question. */
	const askable =
		picked !== null && (!picked.custom || customText !== undefined);

	function goBack() {
		if (view.kind === "search") {
			setView({
				kind: "board",
				familyId: view.from,
				optionId: null,
				custom: "",
			});
			return;
		}
		void navigate(`/g/${session.code}/map`);
	}

	/**
	 * What the point picker on the card can copy a coordinate out of: the fix,
	 * the team's pins, every station on the board and every amenity in the
	 * catalogue — the same pool the map's own pickers offer, because a picker
	 * that holds less on one screen than another is a picker players stop
	 * trusting.
	 */
	const pointSources = usePointSources({
		fix:
			fix && fix.source !== "unavailable"
				? {
						point: [fix.lng, fix.lat],
						accuracyMeters: fix.accuracyMeters,
						capturedAt: fix.capturedAt,
					}
				: null,
		pins,
		stops: mapStops,
		area: games[0]?.mapConfig?.validHidingArea ?? null,
		scalePreset: games[0]?.mapConfig?.scalePreset ?? "city",
		origin: fixPoint,
		session,
	});

	return (
		<PointSourcesProvider value={pointSources}>
			<Screen data-testid="ask-screen">
				{/*
				 * The header the lobby and the map wear: a square grey action in the
				 * corner, one line of title, one label on the trailing edge. The
				 * family select carries `min-h-tap` so the row is exactly as tall as
				 * that square — a header that grows on this screen alone reads as a
				 * different app.
				 */}
				<ScreenHeader
					leading={
						<HeaderAction
							icon="caret-left"
							label={view.kind === "search" ? "Back to the board" : "Map"}
							onClick={goBack}
							testId="ask-back"
						/>
					}
					title={
						view.kind === "search" ? (
							<span className="flex min-h-tap items-center">All questions</span>
						) : (
							<button
								className="-mx-1 flex min-h-tap items-center gap-2 rounded-control px-1 text-left transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-95"
								data-testid="family-select"
								onClick={() => setFamilySheetOpen(true)}
								type="button"
							>
								<Icon name={FAMILY_LOOK[family.id].icon} size="sm" />
								<span className="truncate">{family.name}</span>
								<Icon className="text-ink-faint" name="caret-down" size="sm" />
							</button>
						)
					}
					trailing={
						<span className="eyebrow max-w-28 shrink-0 truncate text-right">
							{role.role === "seeker" && hider ? hider.name : "The rules"}
						</span>
					}
				/>

				<ScreenBody>
					{view.kind === "board" ? (
						<QuestionBoard
							custom={view.custom}
							customText={customText}
							family={family}
							onCustom={(value) =>
								setView({ ...view, kind: "board", custom: value })
							}
							onOpen={(option) => setCard({ family, option })}
							onPick={(option) =>
								setView({
									kind: "board",
									familyId,
									optionId: option.id,
									custom: view.custom,
								})
							}
							pickedId={view.optionId}
							size={size}
						/>
					) : (
						<QuestionSearch
							onOpen={(searchFamily, option) =>
								setCard({ family: searchFamily, option })
							}
							onQueryChange={(query) =>
								setView({ kind: "search", query, from: view.from })
							}
							query={view.query}
							size={size}
						/>
					)}
				</ScreenBody>

				{view.kind === "board" && (
					<ScreenActions>
						{/* Quiet while nothing is picked: a full-strength yellow button
						    that cannot be pressed reads as the app being broken rather
						    than as the screen waiting for a tap. */}
						<ActionButton
							beacon={askable}
							data-testid="open-question-card"
							disabled={!askable}
							hint={picked?.custom ? customText : picked?.label}
							onClick={() => {
								if (askable && picked) setCard({ family, option: picked });
							}}
							tone={askable ? "primary" : "quiet"}
						>
							{askable
								? "Ask"
								: picked?.custom
									? "Type a distance"
									: "Pick one to ask"}
						</ActionButton>
					</ScreenActions>
				)}

				<FamilySheet
					currentId={family.id}
					onClose={() => setFamilySheetOpen(false)}
					onPick={(id) => {
						setFamilySheetOpen(false);
						setView({
							kind: "board",
							familyId: id,
							optionId: null,
							custom: "",
						});
					}}
					onSearch={() => {
						setFamilySheetOpen(false);
						setView({ kind: "search", query: "", from: familyId });
					}}
					open={familySheetOpen}
					size={size}
				/>

				<QuestionCardSheet
					hiderName={role.role === "seeker" ? (hider?.name ?? null) : null}
					onClose={() => setCard(null)}
					onPoint={setChosenPoint}
					pick={card}
					point={point}
					size={size}
					typed={customText}
				/>
			</Screen>
		</PointSourcesProvider>
	);
}

interface PointSourceInput {
	readonly fix: PointSources["fix"];
	readonly pins: PointSources["pins"];
	readonly stops: readonly {
		readonly stopId: string;
		readonly name: string;
		readonly lng: number;
		readonly lat: number;
		readonly modeIds: readonly string[];
		readonly insideArea: boolean;
	}[];
	readonly area: MultiPolygon | null;
	readonly scalePreset: ScalePreset;
	readonly origin: LngLat | null;
	readonly session: Session;
}

/**
 * The same pool the map builds, assembled from the same parts.
 *
 * Amenities are an HTTP fetch rather than Zero rows, and they are fetched here
 * unconditionally: this screen exists to be read, its one card has a point
 * picker in it, and a picker that offers stations but no museums is a picker
 * that quietly does less than the one two taps away.
 */
function usePointSources({
	fix,
	pins,
	stops,
	area,
	scalePreset,
	origin,
	session,
}: PointSourceInput): PointSources {
	const stations = useMemo<readonly SearchableStop[]>(
		() =>
			stops.map((stop) => ({
				stopId: stop.stopId,
				name: stop.name,
				lng: stop.lng,
				lat: stop.lat,
				modeIds: stop.modeIds,
				lines: [],
				insideArea: stop.insideArea,
			})),
		[stops],
	);
	const bbox = useMemo(() => (area ? multiPolygonBBox(area) : null), [area]);
	// The same margin the map materialises stops at, so a picker opened here and
	// one opened there hold the same places.
	const poiBbox = useMemo(
		() =>
			bbox ? expandBBox(bbox, SCALE_SETTINGS[scalePreset].marginMeters) : null,
		[bbox, scalePreset],
	);
	const catalogPois = usePois(session, poiBbox, true);

	const places = useMemo<readonly MapPoi[]>(() => {
		const region = area ? multiPolygonToRegion(area) : null;
		const amenities: MapPoi[] = [];
		for (const row of catalogPois) {
			if (!isPoiKind(row.kind)) continue;
			amenities.push({
				id: row.id,
				name: row.name,
				kind: row.kind,
				lng: row.lng,
				lat: row.lat,
				insideArea: region ? regionContains(region, [row.lng, row.lat]) : true,
			});
		}
		return [...amenities, ...stationPois(stations)];
	}, [catalogPois, area, stations]);

	const placeTypes = useMemo<readonly PoiTypeId[]>(
		() => [...boardStopModes(stations), ...POI_KINDS],
		[stations],
	);

	return {
		fix,
		pins,
		places,
		placeTypes,
		hidingZoneStop: null,
		origin,
		area: bbox,
	};
}
