import { Surface } from "@zero-lag/ui/components/surface";

interface MapControlsProps {
	/** Null for a seeker: the toggle would be a no-op with a confusing label. */
	readonly blindness: { readonly blind: boolean; toggle(): void } | null;
}

/**
 * Notices that used to sit next to the camera cycle. The cycle itself now
 * lives on the HUD; blindness stays on the map so a hidden team still has
 * words, not only a glyph.
 */
export function MapControls({ blindness }: MapControlsProps) {
	if (!blindness?.blind) return null;
	return (
		<div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 space-y-2">
			<Surface
				className="pointer-events-auto w-fit px-3 py-2 text-sm"
				data-testid="blindness-notice"
				raised
			>
				Other teams are hidden on your map.
			</Surface>
		</div>
	);
}
