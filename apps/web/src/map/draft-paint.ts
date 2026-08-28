import { useTheme } from "@zero-lag/ui/hooks/use-theme";
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
