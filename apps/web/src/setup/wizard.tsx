import { useQuery } from "@rocicorp/zero/react";
import type { ModeId } from "@zero-lag/catalog";
import {
	type MultiPolygon,
	multiPolygonToRegion,
	regionArea,
} from "@zero-lag/geo";
import { queries, type ScalePreset, type Selection } from "@zero-lag/schema";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLocation } from "react-router";
import {
	clamp,
	type GameSize,
	HIDING_DURATION_MAX_MS,
	HIDING_DURATION_MIN_MS,
	HIDING_DURATION_STEP_MS,
	HIDING_ZONE_MAX_M,
	HIDING_ZONE_MIN_M,
	HIDING_ZONE_STEP_M,
	SIZE_BANDS,
	type SizeBand,
	suggestGameSize,
} from "./game-size";

/**
 * What the create-a-game wizard is holding while the host walks through it.
 *
 * The game exists from the first screen — a token has to exist before the
 * catalog can be read — but nothing the wizard decides is written until the
 * review step. Four screens that each apply their own change would leave a host
 * who backs out halfway with a game configured to somewhere they had already
 * changed their mind about, and would rebuild the board three times on the way.
 *
 * The draft therefore stores **overrides only**. Everything shown is derived
 * during render from the board the game already has: the suggestion follows the
 * area, the two numbers follow the suggestion, and a value the host has not
 * touched is not stored anywhere.
 */

export interface SetupDraft {
	/** Null while every mode counts, which is not the same as listing them all. */
	readonly modeIds: readonly ModeId[] | null;
	/** Null while the size is whatever the area suggests. */
	readonly size: GameSize | null;
	readonly hidingDurationMs: number | null;
	readonly hidingRadiusMeters: number | null;
}

export interface ModeTally {
	readonly modeId: ModeId;
	readonly stops: number;
	readonly lines: number;
}

export interface SetupState {
	/** Null until the first sync lands. */
	readonly area: AreaFacts | null;
	readonly roundId: string | null;
	/** What the round is set to now, so the review can tell a change from a no-op. */
	readonly currentHidingDurationMs: number | null;
	readonly modes: readonly ModeTally[];
	readonly selectedModes: readonly ModeId[] | null;
	readonly stopsInPlay: number;
	readonly suggestedSize: GameSize;
	readonly size: GameSize;
	readonly band: SizeBand;
	readonly hidingDurationMs: number;
	readonly hidingRadiusMeters: number;
	/** Set only while the host has moved the number off what the size set. */
	readonly durationOverridden: boolean;
	readonly zoneOverridden: boolean;
	toggleMode(modeId: ModeId): void;
	chooseSize(size: GameSize): void;
	stepDuration(direction: 1 | -1): void;
	stepZone(direction: 1 | -1): void;
	restoreDuration(): void;
	restoreZone(): void;
	/** Everything the review step needs to write, in one object. */
	readonly draft: SetupDraft;
}

/**
 * The board the game currently has, as the wizard needs to read it: to describe
 * the area, and to tell whether anything the host chose is actually a change.
 */
export interface AreaFacts {
	readonly name: string;
	readonly selection: Selection;
	readonly squareKm: number;
	readonly scalePreset: ScalePreset;
	readonly totalStops: number;
	readonly modeIds: readonly string[] | null;
	readonly hidingRadiusMeters: number;
	readonly hidingArea: MultiPolygon;
}

const SetupContext = createContext<SetupState | null>(null);

export function useSetup(): SetupState {
	const value = useContext(SetupContext);
	if (!value) throw new Error("useSetup outside a SetupProvider");
	return value;
}

export function SetupProvider({ children }: { children: ReactNode }) {
	const fromLobby =
		new URLSearchParams(useLocation().search).get("from") === "lobby";
	const [draft, setDraft] = useState<SetupDraft>({
		modeIds: null,
		size: null,
		hidingDurationMs: null,
		hidingRadiusMeters: null,
	});
	const seeded = useRef(false);
	const [games] = useQuery(queries.game());
	const [stops] = useQuery(queries.mapStops());
	const [rounds] = useQuery(queries.rounds());

	const config = games[0]?.mapConfig ?? null;

	const area = useMemo<AreaFacts | null>(() => {
		if (!config) return null;
		return {
			name: config.name,
			selection: config.selection,
			squareKm: regionArea(multiPolygonToRegion(config.validHidingArea)) / 1e6,
			scalePreset: config.scalePreset,
			totalStops: stops.filter((stop) => stop.insideArea).length,
			modeIds: config.modeIds ?? null,
			hidingRadiusMeters: config.hidingRadiusMeters,
			hidingArea: config.validHidingArea,
		};
	}, [config, stops]);

	/**
	 * Every mode with a stop inside the area, in the order a Berliner would list
	 * them. A mode nobody can catch here is not a decision worth offering.
	 */
	const modes = useMemo<readonly ModeTally[]>(() => {
		const byMode = new Map<string, { stops: number; lines: Set<string> }>();
		for (const stop of stops) {
			if (!stop.insideArea) continue;
			for (const modeId of stop.modeIds) {
				const tally = byMode.get(modeId) ?? { stops: 0, lines: new Set() };
				tally.stops += 1;
				byMode.set(modeId, tally);
			}
			for (const line of stop.lines) {
				byMode.get(line.modeId)?.lines.add(line.name);
			}
		}
		return MODE_ORDER.filter((modeId) => byMode.has(modeId)).map((modeId) => {
			const tally = byMode.get(modeId);
			return {
				modeId,
				stops: tally?.stops ?? 0,
				lines: tally?.lines.size ?? 0,
			};
		});
	}, [stops]);

	const stopsInPlay = useMemo(() => {
		const wanted = draft.modeIds ? new Set<string>(draft.modeIds) : null;
		return stops.filter(
			(stop) =>
				stop.insideArea &&
				(!wanted || stop.modeIds.some((modeId) => wanted.has(modeId))),
		).length;
	}, [stops, draft.modeIds]);

	const suggestedSize = suggestGameSize(stopsInPlay, area?.squareKm ?? 0);
	const size = draft.size ?? suggestedSize;
	const band = SIZE_BANDS[size];
	const hidingDurationMs = draft.hidingDurationMs ?? band.hidingDurationMs;
	const hidingRadiusMeters =
		draft.hidingRadiusMeters ?? band.hidingRadiusMeters;

	/** The round the lobby is about to start; there is always exactly one. */
	const round = [...rounds].reverse().find((value) => value.status !== "ended");
	const roundId = round?.id ?? null;

	useEffect(() => {
		if (!fromLobby || seeded.current || !area || !round) return;
		seeded.current = true;
		setDraft({
			modeIds: (area.modeIds as ModeId[] | null) ?? null,
			size: null,
			hidingDurationMs: round.hidingDurationMs,
			hidingRadiusMeters: area.hidingRadiusMeters,
		});
	}, [fromLobby, area, round]);

	const value = useMemo<SetupState>(
		() => ({
			area,
			roundId,
			currentHidingDurationMs: round?.hidingDurationMs ?? null,
			modes,
			selectedModes: draft.modeIds,
			stopsInPlay,
			suggestedSize,
			size,
			band,
			hidingDurationMs,
			hidingRadiusMeters,
			durationOverridden:
				draft.hidingDurationMs !== null &&
				draft.hidingDurationMs !== band.hidingDurationMs,
			zoneOverridden:
				draft.hidingRadiusMeters !== null &&
				draft.hidingRadiusMeters !== band.hidingRadiusMeters,
			draft,
			toggleMode: (modeId) =>
				setDraft((current) => ({
					...current,
					modeIds: nextModes(current.modeIds, modeId, modes),
				})),
			/**
			 * Picking a size drops both overrides: the whole point of the three
			 * buttons is that they set the numbers, and a size that left a
			 * hand-typed 75 minutes in place would have set nothing.
			 */
			chooseSize: (next) =>
				setDraft((current) => ({
					...current,
					size: next,
					hidingDurationMs: null,
					hidingRadiusMeters: null,
				})),
			stepDuration: (direction) =>
				setDraft((current) => ({
					...current,
					hidingDurationMs: clamp(
						(current.hidingDurationMs ?? band.hidingDurationMs) +
							direction * HIDING_DURATION_STEP_MS,
						HIDING_DURATION_MIN_MS,
						HIDING_DURATION_MAX_MS,
					),
				})),
			stepZone: (direction) =>
				setDraft((current) => ({
					...current,
					hidingRadiusMeters: clamp(
						(current.hidingRadiusMeters ?? band.hidingRadiusMeters) +
							direction * HIDING_ZONE_STEP_M,
						HIDING_ZONE_MIN_M,
						HIDING_ZONE_MAX_M,
					),
				})),
			restoreDuration: () =>
				setDraft((current) => ({ ...current, hidingDurationMs: null })),
			restoreZone: () =>
				setDraft((current) => ({ ...current, hidingRadiusMeters: null })),
		}),
		[
			area,
			roundId,
			round?.hidingDurationMs,
			modes,
			stopsInPlay,
			suggestedSize,
			size,
			band,
			hidingDurationMs,
			hidingRadiusMeters,
			draft,
		],
	);

	return (
		<SetupContext.Provider value={value}>{children}</SetupContext.Provider>
	);
}

/**
 * Turning one mode off for the first time is what turns the filter on: until
 * then the game plays everything, including a mode the feed grows next year.
 * Turning the last one back on returns it to that state rather than leaving a
 * list that happens to name them all.
 */
function nextModes(
	current: readonly ModeId[] | null,
	modeId: ModeId,
	available: readonly ModeTally[],
): readonly ModeId[] | null {
	const all = available.map((mode) => mode.modeId);
	const selected = new Set<ModeId>(current ?? all);
	if (selected.has(modeId)) selected.delete(modeId);
	else selected.add(modeId);

	// Never leave a game with nothing to catch.
	if (selected.size === 0) return current;
	if (all.every((id) => selected.has(id))) return null;
	return all.filter((id) => selected.has(id));
}

/** U-Bahn, S-Bahn, tram, bus — then the ones a city game rarely turns on. */
const MODE_ORDER: readonly ModeId[] = [
	"u-bahn",
	"s-bahn",
	"tram",
	"bus",
	"regional",
	"long-distance",
	"ferry",
	"funicular",
];
