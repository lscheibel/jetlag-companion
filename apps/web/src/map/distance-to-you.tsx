import type { LngLat } from "@zero-lag/geo";
import { distanceFromYou } from "./toolkit";

interface DistanceToYouProps {
	readonly from: LngLat | null;
	readonly lng: number;
	readonly lat: number;
}

/** Shown on a stop or amenity sheet when the phone has a GPS fix. */
export function DistanceToYou({ from, lng, lat }: DistanceToYouProps) {
	const label = distanceFromYou(from, lng, lat);
	if (!label) return null;
	return (
		<p className="text-sm" data-testid="distance-to-you">
			{label} from you
		</p>
	);
}
