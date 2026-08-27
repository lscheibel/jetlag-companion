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
			{shown.map((pin) => (
				<MapMarker key={pin.id} lat={pin.lat} lng={pin.lng}>
					<button
						data-testid={`pin-${pin.id}`}
						disabled={disabled}
						onClick={(event) => {
							event.stopPropagation();
							onSelect(pin.id);
						}}
						onPointerDown={(event) => event.stopPropagation()}
						type="button"
					>
						<PinMark color={pin.color} label={pin.label} />
					</button>
				</MapMarker>
			))}
		</>
	);
}

export function PinDraftMarker({
	point,
	color,
	label,
}: {
	readonly point: readonly [number, number];
	readonly color: string;
	readonly label: string;
}) {
	return (
		<MapMarker lat={point[1]} lng={point[0]}>
			<span data-testid="pin-draft">
				<PinMark color={color} label={label} />
			</span>
		</MapMarker>
	);
}

function PinMark({
	color,
	label,
}: {
	readonly color: string;
	readonly label: string;
}) {
	const name = label.trim();
	return (
		<span className="flex min-h-11 flex-col items-center">
			<PinDot color={color} />
			{name ? (
				<span className="mt-0.5 max-w-28 truncate rounded-md bg-surface/95 px-1.5 py-0.5 font-semibold text-[0.65rem] leading-tight shadow">
					{name}
				</span>
			) : null}
		</span>
	);
}

function PinDot({ color }: { readonly color: string }) {
	return (
		<span
			className="block size-5 shrink-0 rounded-full border-2 border-white shadow"
			style={{ backgroundColor: color }}
		/>
	);
}
