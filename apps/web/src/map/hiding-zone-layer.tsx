import { circleLngLat, type LngLat } from "@zero-lag/geo";
import { useTheme } from "@zero-lag/ui/hooks/use-theme";
import { cn } from "@zero-lag/ui/lib/utils";
import { useMemo } from "react";
import { yellowBlackLine } from "./draft-paint";
import { EMPTY_FEATURES, multiPolygonFeature } from "./geojson";
import { MapMarker } from "./map-canvas";
import { useGeoJsonLayer } from "./use-geojson-layer";

const MUTED_OUTLINE = {
	case: "#d8dce2",
	core: "#4B4B4B",
} as const;

interface HidingZoneLayerProps {
	readonly id?: string;
	readonly center: LngLat | null;
	readonly radiusMeters: number;
	/** Solid once committed; dashed while still a pick. */
	readonly committed?: boolean;
	/** Committed zone under another pick: readable, but not the live one. */
	readonly muted?: boolean;
}

/** The circle a hider has to stay in. Private to that team. */
export function HidingZoneLayer({
	id = "hiding-zone",
	center,
	radiusMeters,
	committed = false,
	muted = false,
}: HidingZoneLayerProps) {
	const { resolved } = useTheme();
	const dark = resolved === "dark";
	const data = useMemo(
		() =>
			center && radiusMeters > 0
				? multiPolygonFeature(circleLngLat(center, radiusMeters))
				: EMPTY_FEATURES,
		[center, radiusMeters],
	);
	const layers = useMemo(
		() => [
			{
				id: `${id}-fill`,
				type: "fill" as const,
				paint: {
					"fill-color": muted ? "#4B4B4B" : "#ffe01f",
					"fill-opacity": muted ? 0.1 : 0.16,
					"fill-outline-color": "rgba(0,0,0,0)",
				},
			},
			...(muted
				? mutedLine(`${id}-outline`)
				: yellowBlackLine(`${id}-outline`, dark, !committed)),
		],
		[id, committed, dark, muted],
	);
	useGeoJsonLayer(`${id}-source`, data, layers);

	if (!center) return null;
	return (
		<MapMarker lat={center[1]} lng={center[0]}>
			<span
				className={cn(
					"block size-3 rounded-full border-2 border-white shadow",
					muted ? "bg-[#4B4B4B]" : "bg-action",
				)}
				data-testid={muted ? `${id}-center` : "hiding-zone-center"}
			/>
		</MapMarker>
	);
}

function mutedLine(id: string) {
	return [
		{
			id: `${id}-case`,
			type: "line" as const,
			layout: {
				"line-join": "round" as const,
				"line-cap": "round" as const,
			},
			paint: {
				"line-color": MUTED_OUTLINE.case,
				"line-width": 7,
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
				"line-color": MUTED_OUTLINE.core,
				"line-width": 3,
			},
		},
	];
}
