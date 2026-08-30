import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import type { LayerSpecification } from "maplibre-gl";
import { useMemo } from "react";

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

export function playerTrailLine(
	id: string,
	dark: boolean,
): Omit<LayerSpecification, "source">[] {
	return [
		{
			id: `${id}-case`,
			type: "line",
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				"line-color": dark ? TRAIL_CASE_DARK : TRAIL_CASE_LIGHT,
				"line-width": 4,
				"line-opacity": ["*", TRAIL_CASE_OPACITY, ["get", "fade"]],
			},
		},
		{
			id,
			type: "line",
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				// Data-driven, so one layer paints every team.
				"line-color": ["get", "color"],
				"line-width": 2,
				"line-opacity": ["*", TRAIL_CORE_OPACITY, ["get", "fade"]],
			},
		},
	];
}

export function usePlayerTrailLine(id: string) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	return useMemo(() => playerTrailLine(id, dark), [id, dark]);
}
