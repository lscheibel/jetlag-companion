import { useMapInstance } from "./map-canvas";
import { useMapCamera } from "./use-map-camera";

export function NorthReset() {
	const map = useMapInstance();
	const { bearing, pitch } = useMapCamera();
	if (Math.abs(bearing) < 0.01 && Math.abs(pitch) < 0.01) return null;
	return (
		<button
			className="absolute top-16 left-1/2 z-20 min-h-11 -translate-x-1/2 rounded border bg-surface px-4 shadow"
			data-testid="reset-north"
			onClick={() => map?.easeTo({ bearing: 0, pitch: 0 })}
			type="button"
		>
			North ↑
		</button>
	);
}
