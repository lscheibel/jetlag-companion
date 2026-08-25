import { circleLngLat } from "@zero-lag/geo";
import { useMemo } from "react";
import { ringsFeature } from "./geojson";
import { MapMarker } from "./map-canvas";
import { useGeoJsonLayer } from "./use-geojson-layer";

export interface MapPin {
	readonly id: string;
	readonly lng: number;
	readonly lat: number;
	readonly radiusMeters: number | null;
	readonly label: string;
	readonly note: string;
	readonly color: string;
	readonly createdByPlayerId: string;
}

const RADIUS_LAYERS = [
	{
		id: "pin-radius-fill",
		type: "fill" as const,
		paint: { "fill-color": "#4B4B4B", "fill-opacity": 0.09 },
	},
	{
		id: "pin-radius-outline",
		type: "line" as const,
		paint: {
			"line-color": "#4B4B4B",
			"line-width": 2,
			"line-dasharray": [2, 2],
		},
	},
];

interface PinLayerProps {
	readonly pins: readonly MapPin[];
	readonly disabled: boolean;
	readonly omitId?: string | null;
	readonly onSelect: (pinId: string) => void;
}

export function PinLayer({ pins, disabled, omitId, onSelect }: PinLayerProps) {
	const shown = omitId ? pins.filter((pin) => pin.id !== omitId) : pins;
	const radii = useMemo(
		() =>
			ringsFeature(
				shown.flatMap((pin) =>
					pin.radiusMeters && pin.radiusMeters > 0
						? circleLngLat([pin.lng, pin.lat], pin.radiusMeters).flat()
						: [],
				),
			),
		[shown],
	);
	useGeoJsonLayer("pin-radius-source", radii, RADIUS_LAYERS);

	return (
		<>
			{shown.map((pin, index) => (
				<MapMarker key={pin.id} lat={pin.lat} lng={pin.lng}>
					<button
						className="flex min-h-11 items-center gap-1 rounded-full bg-surface/90 pr-2 font-semibold text-xs shadow"
						data-testid={`pin-${pin.id}`}
						disabled={disabled}
						onClick={() => onSelect(pin.id)}
						type="button"
					>
						<span
							className="size-5 rounded-full border-2 border-white"
							style={{ backgroundColor: pin.color }}
						/>
						{pin.label.trim() || `Pin ${index + 1}`}
					</button>
				</MapMarker>
			))}
		</>
	);
}

export function PinDraftMarker({
	point,
	color,
}: {
	readonly point: readonly [number, number];
	readonly color: string;
}) {
	return (
		<MapMarker lat={point[1]} lng={point[0]}>
			<span
				className="block size-5 rounded-full border-2 border-white shadow"
				data-testid="pin-draft"
				style={{ backgroundColor: color }}
			/>
		</MapMarker>
	);
}
