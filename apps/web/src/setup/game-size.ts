import type { ScalePreset } from "@zero-lag/schema";

/**
 * How big a game is, in the terms the people playing it use.
 *
 * Three sizes rather than the five scale presets, because a host setting up on
 * a sofa is answering "is this an evening or a weekend?" — not choosing a
 * materialisation margin. A size **prefills** the two numbers that matter and
 * decides nothing: both stay adjustable on the same screen, and a size that
 * sets 60 minutes has not stopped the host from playing 75.
 *
 * The bands and durations are the Jet Lag: Hide + Seek rulebook's, converted to
 * metric because the app is metric throughout.
 */

export type GameSize = "small" | "medium" | "large";

export const GAME_SIZES = ["small", "medium", "large"] as const;

export interface SizeBand {
	readonly size: GameSize;
	readonly letter: string;
	/** Two or three words under the letter on the picker. */
	readonly caption: string;
	readonly name: string;
	/** What kind of place this is, in one line. */
	readonly blurb: string;
	readonly examples: string;
	readonly runsFor: string;
	readonly stopsRange: string;
	readonly groundRange: string;
	/** What the preset sets when it is chosen. */
	readonly hidingDurationMs: number;
	readonly hidingRadiusMeters: number;
	/**
	 * The scale preset a map of this size is built at. It sets the stop
	 * materialisation margin and M6's question distances; the hiding radius
	 * above overrides the preset's own, which m4-spec §6 explicitly allows.
	 */
	readonly scalePreset: ScalePreset;
	/** Upper bound of the band, exclusive. Infinity on the largest. */
	readonly maxStops: number;
	readonly maxSquareKm: number;
}

const MINUTE = 60_000;

export const SIZE_BANDS: Readonly<Record<GameSize, SizeBand>> = {
	small: {
		size: "small",
		letter: "S",
		caption: "Town",
		name: "Small",
		blurb: "A town, or part of a city",
		examples: "Kreuzberg · Potsdam · Lower Manhattan",
		runsFor: "Four to eight hours",
		stopsRange: "30–100",
		groundRange: "26–260 km²",
		hidingDurationMs: 30 * MINUTE,
		hidingRadiusMeters: 400,
		scalePreset: "district",
		maxStops: 100,
		maxSquareKm: 260,
	},
	medium: {
		size: "medium",
		letter: "M",
		caption: "City",
		name: "Medium",
		blurb: "A city or metro area",
		examples: "All of Berlin · Greater London · Hong Kong",
		runsFor: "About a day",
		stopsRange: "100–500",
		groundRange: "260–2,600 km²",
		hidingDurationMs: 60 * MINUTE,
		hidingRadiusMeters: 400,
		scalePreset: "city",
		maxStops: 500,
		maxSquareKm: 2_600,
	},
	large: {
		size: "large",
		letter: "L",
		caption: "Region",
		name: "Large",
		blurb: "A large region, or a country",
		examples: "Brandenburg · Switzerland · Japan",
		runsFor: "Two to four days",
		stopsRange: "500 and up",
		groundRange: "2,600 km² and up",
		hidingDurationMs: 180 * MINUTE,
		hidingRadiusMeters: 800,
		scalePreset: "metro",
		maxStops: Number.POSITIVE_INFINITY,
		maxSquareKm: Number.POSITIVE_INFINITY,
	},
};

/**
 * What the area itself suggests.
 *
 * Two readings, and the **smaller** band wins: a dense city packs several
 * hundred stops into very little ground, and how long a game takes follows the
 * ground far more than the stop count. It is also what makes 720 stops across
 * 891 km² read as a medium game rather than a large one, which is the answer a
 * host would give.
 */
export function suggestGameSize(stops: number, squareKm: number): GameSize {
	const byStops = bandOf((band) => stops < band.maxStops);
	const byGround = bandOf((band) => squareKm < band.maxSquareKm);
	return GAME_SIZES.indexOf(byStops) <= GAME_SIZES.indexOf(byGround)
		? byStops
		: byGround;
}

function bandOf(fits: (band: SizeBand) => boolean): GameSize {
	return GAME_SIZES.find((size) => fits(SIZE_BANDS[size])) ?? "large";
}

/** Minutes, because a hiding phase is never counted in anything else. */
export function formatDuration(ms: number): string {
	return `${Math.round(ms / MINUTE)} min`;
}

export function formatZone(meters: number): string {
	return meters >= 1000
		? `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)} km`
		: `${Math.round(meters)} m`;
}

export function formatGround(squareKm: number): string {
	return `${Math.round(squareKm).toLocaleString("en")} km²`;
}

/** Steps a host can actually mean: five minutes, and hundreds of metres. */
export const HIDING_DURATION_STEP_MS = 5 * MINUTE;
export const HIDING_DURATION_MIN_MS = 15 * MINUTE;
export const HIDING_DURATION_MAX_MS = 240 * MINUTE;
export const HIDING_ZONE_STEP_M = 100;
export const HIDING_ZONE_MIN_M = 100;
export const HIDING_ZONE_MAX_M = 5_000;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Land on the next (or previous) step on the grid, rather than adding the
 * step on top of an off-grid value. A 547 m drag then + becomes 600 m, not 647.
 */
export function stepGrid(
	current: number,
	direction: 1 | -1,
	step: number,
	min: number,
	max: number,
): number {
	const units = current / step;
	const snapped = Math.round(units);
	const onGrid = Math.abs(units - snapped) < 1e-6;
	const nextUnits = onGrid
		? snapped + direction
		: direction === 1
			? Math.ceil(units)
			: Math.floor(units);
	return clamp(nextUnits * step, min, max);
}

export function stepZoneMeters(current: number, direction: 1 | -1): number {
	return stepGrid(
		current,
		direction,
		HIDING_ZONE_STEP_M,
		HIDING_ZONE_MIN_M,
		HIDING_ZONE_MAX_M,
	);
}
