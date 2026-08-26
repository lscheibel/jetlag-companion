import { Icon } from "@zero-lag/ui/components/icon";
import { useMapInstance } from "./map-canvas";
import { useMapCamera } from "./use-map-camera";

/** The way back to north, only while the map is not already facing it. */
export function NorthReset() {
	const map = useMapInstance();
	const { bearing, pitch } = useMapCamera();
	if (Math.abs(bearing) < 0.01 && Math.abs(pitch) < 0.01) return null;
	return (
		<button
			className={[
				"absolute top-16 left-1/2 z-20 flex min-h-tap -translate-x-1/2 items-center gap-1.5",
				"rounded-chip border-[1.5px] border-hairline px-4",
				"bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] text-ink backdrop-blur-[6px]",
				"font-mono text-[0.66rem] uppercase tracking-[0.08em]",
				"shadow-[0_2px_8px_-4px_rgb(0_0_0/0.4)]",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-95",
			].join(" ")}
			data-testid="reset-north"
			onClick={() => map?.easeTo({ bearing: 0, pitch: 0 })}
			type="button"
		>
			<Icon name="caret-up" size="xs" />
			North
		</button>
	);
}
