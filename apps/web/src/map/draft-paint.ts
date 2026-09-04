import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import { useMemo } from "react";
import type { MapLayerSpec } from "./use-geojson-layer";

/**
 * The in-hand casing: a yellow case against the map, and a core that reads
 * on top of it — black in the dark, the yellow's own darker edge in the light
 * so the line stays a two-tone without dropping a black stroke onto a pale
 * basemap.
 */
const CASE = "#ffe01f";
const CORE_DARK = "#08111c";
const CORE_LIGHT = "#b39b00";

export function yellowBlackLine(id: string, dark: boolean, dashed = false) {
	const dash = dashed ? { "line-dasharray": [2, 1.5] } : {};
	return [
		{
			id: `${id}-case`,
			type: "line" as const,
			layout: {
				"line-join": "round" as const,
				"line-cap": "round" as const,
			},
			paint: {
				"line-color": CASE,
				"line-width": 7,
				...dash,
			},
		},
		{
			id,
			type: "line" as const,
			layout: {
				"line-join": "round" as const,
				"line-cap": "round" as const,
			},
			paint: {
				"line-color": dark ? CORE_DARK : CORE_LIGHT,
				"line-width": 3,
				...dash,
			},
		},
	];
}

export function useYellowBlackLine(id: string, dashed = false) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	return useMemo(() => yellowBlackLine(id, dark, dashed), [id, dashed, dark]);
}

/**
 * The same two-tone trick as `yellowBlackLine`, for a line whose colour is not
 * ours to choose. m2-spec §4, _Trails_.
 *
 * A trail is painted in its team's colour, and a team colour is picked to tell
 * teams apart rather than to sit on a basemap — some of the palette disappears
 * into Positron's pale ground and some into Dark's. So the colour rides on a
 * backing that does the separating, and the backing is the one part that knows
 * about the theme.
 *
 * Thinner than the in-hand tools on purpose: a hairline with a halo is what
 * history should look like next to the solid strokes that are the game itself.
 *
 * Both layers are scaled by the feature's own `fade`, so the whole trail — the
 * backing included — thins out towards its old end. Fading only the colour
 * would leave a halo hanging in the air behind it.
 */
const TRAIL_CASE_LIGHT = "#ffffff";
const TRAIL_CASE_DARK = "#08111c";
/** The strength each layer reaches at the head; the fade scales both down. */
const TRAIL_CASE_OPACITY = 1;
const TRAIL_CORE_OPACITY = 0.9;

const TRAIL_CASE_WIDTH = 4;
const TRAIL_CORE_WIDTH = 2;

/**
 * The dash for a leg the trail never saw. m2-spec §4, _Trails_.
 *
 * A solid line between two fixes half an hour apart says the player went that
 * way, which is a thing this app cannot know. The dash is the only part of the
 * drawing that can say "somewhere along here" instead, and it costs nothing to
 * read: everybody already knows what a dashed route means.
 *
 * `line-dasharray` counts in line widths, so the case and the core need
 * different numbers to produce the same dash on the ground — 6 px of line and
 * 4 px of air in both. A dash under a round cap grows by half a width at each
 * end and closes the gaps up, so these two layers are the butt-capped ones.
 */
const TRAIL_GAP_DASH_ON = 6;
const TRAIL_GAP_DASH_OFF = 4;

function gapDash(width: number): [number, number] {
	return [TRAIL_GAP_DASH_ON / width, TRAIL_GAP_DASH_OFF / width];
}

/**
 * The two halves of the source, so the same features are drawn twice over and
 * only one of the pair claims each piece.
 *
 * `!=` rather than `["!", ["get", "inferred"]]`: `get` on a property a feature
 * does not carry is `null`, which `!` rejects as a non-boolean and `!=` reads
 * as "not a gap". Every feature `trailsFeature` writes carries the property,
 * and this is the form that does not depend on that staying true.
 */
const OBSERVED: FilterSpecification = ["!=", ["get", "inferred"], true];
const INFERRED: FilterSpecification = ["==", ["get", "inferred"], true];

export function playerTrailLine(id: string, dark: boolean): MapLayerSpec[] {
	const caseColor = dark ? TRAIL_CASE_DARK : TRAIL_CASE_LIGHT;
	const fade = (opacity: number): ExpressionSpecification => [
		"*",
		opacity,
		["get", "fade"],
	];
	return [
		{
			id: `${id}-case`,
			type: "line",
			filter: OBSERVED,
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				"line-color": caseColor,
				"line-width": TRAIL_CASE_WIDTH,
				"line-opacity": fade(TRAIL_CASE_OPACITY),
			},
		},
		{
			id: `${id}-gap-case`,
			type: "line",
			filter: INFERRED,
			layout: { "line-join": "round", "line-cap": "butt" },
			paint: {
				"line-color": caseColor,
				"line-width": TRAIL_CASE_WIDTH,
				"line-opacity": fade(TRAIL_CASE_OPACITY),
				"line-dasharray": gapDash(TRAIL_CASE_WIDTH),
			},
		},
		{
			id,
			type: "line",
			filter: OBSERVED,
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				// Data-driven, so one layer paints every team.
				"line-color": ["get", "color"],
				"line-width": TRAIL_CORE_WIDTH,
				"line-opacity": fade(TRAIL_CORE_OPACITY),
			},
		},
		{
			id: `${id}-gap`,
			type: "line",
			filter: INFERRED,
			layout: { "line-join": "round", "line-cap": "butt" },
			paint: {
				"line-color": ["get", "color"],
				"line-width": TRAIL_CORE_WIDTH,
				"line-opacity": fade(TRAIL_CORE_OPACITY),
				"line-dasharray": gapDash(TRAIL_CORE_WIDTH),
			},
		},
	];
}

export function usePlayerTrailLine(id: string) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	return useMemo(() => playerTrailLine(id, dark), [id, dark]);
}
