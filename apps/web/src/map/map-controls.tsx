import { type Camera, cameraLabel } from "./camera";

interface MapControlsProps {
	readonly camera: Camera;
	readonly onCycleCamera: () => void;
	/** Null for a seeker: the toggle would be a no-op with a confusing label. */
	readonly blindness: { readonly blind: boolean; toggle(): void } | null;
	readonly trackingNotice: string | null;
}

/**
 * Field-hostile, per the build plan and m1-spec §11: 44px targets, one-handed
 * reach at the bottom of the screen, and nothing carried by colour alone.
 */
export function MapControls({
	camera,
	onCycleCamera,
	blindness,
	trackingNotice,
}: MapControlsProps) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 space-y-2 p-3">
			{trackingNotice && (
				<p
					className="pointer-events-auto rounded bg-surface/90 px-3 py-2 text-xs shadow"
					data-testid="tracking-notice"
				>
					{trackingNotice}
				</p>
			)}

			{blindness?.blind && (
				<p
					className="pointer-events-auto rounded border border-amber-500 bg-surface/90 px-3 py-2 text-sm shadow"
					data-testid="blindness-notice"
				>
					Other teams are hidden on your map.
				</p>
			)}

			<div className="pointer-events-auto flex gap-2">
				{/*
				 * The recenter control cycles forward and says which mode it is in,
				 * rather than being a button that silently does one of three things.
				 * `followHeading` appears only where there is a compass. m2-spec §12.
				 */}
				<button
					className="min-h-11 rounded border bg-surface px-4 shadow"
					data-camera-mode={camera.mode}
					data-testid="cycle-camera"
					onClick={onCycleCamera}
					type="button"
				>
					{cameraLabel(camera)}
				</button>

				{blindness && (
					<button
						className="ml-auto min-h-11 rounded border bg-surface px-4 shadow"
						data-testid="toggle-blindness"
						onClick={blindness.toggle}
						type="button"
					>
						{blindness.blind ? "Show other teams" : "Hide other teams"}
					</button>
				)}
			</div>
		</div>
	);
}
