import { SCALE_SETTINGS } from "@zero-lag/catalog";
import { SCALE_PRESETS, type ScalePreset } from "@zero-lag/schema";

export type SaveState =
	| { readonly kind: "idle" }
	| { readonly kind: "saving" }
	| { readonly kind: "applying" }
	| { readonly kind: "saved"; readonly code: string }
	| {
			readonly kind: "applied";
			readonly stopCount: number;
			readonly catalogVersionChanged: boolean;
	  }
	| { readonly kind: "failed"; readonly message: string };

interface SaveSheetProps {
	readonly name: string;
	readonly scalePreset: ScalePreset;
	readonly suggestedPreset: ScalePreset;
	readonly hidingRadiusMeters: number;
	readonly canSave: boolean;
	readonly state: SaveState;
	readonly roundRunning: boolean;
	readonly onName: (name: string) => void;
	readonly onPreset: (preset: ScalePreset) => void;
	readonly onRadius: (meters: number) => void;
	readonly onSave: () => void;
	readonly onApply: () => void;
}

/**
 * Name, preset, radius, save, share, apply. m4-spec §9.
 *
 * Applying shows a spinner and can fail, because m3-spec §10 settled that a
 * write which has to be true somewhere else before it means anything waits —
 * and a board everybody plays on is the case that rule was written for.
 */
export function SaveSheet(props: SaveSheetProps) {
	const busy = props.state.kind === "saving" || props.state.kind === "applying";

	return (
		<section
			className="pointer-events-auto rounded bg-background/95 p-3 shadow"
			data-testid="save-sheet"
		>
			<label className="block text-sm" htmlFor="map-name">
				Name
			</label>
			<input
				className="mt-1 min-h-11 w-full rounded border px-2"
				data-testid="map-name"
				id="map-name"
				onChange={(event) => props.onName(event.target.value)}
				placeholder="Berlin — Ringbahn"
				value={props.name}
			/>

			<label className="mt-3 block text-sm" htmlFor="map-preset">
				Scale
			</label>
			<select
				className="mt-1 min-h-11 w-full rounded border px-2"
				data-testid="map-preset"
				id="map-preset"
				onChange={(event) => props.onPreset(event.target.value as ScalePreset)}
				value={props.scalePreset}
			>
				{SCALE_PRESETS.map((preset) => (
					<option key={preset} value={preset}>
						{preset}
						{preset === props.suggestedPreset ? " (suggested)" : ""}
					</option>
				))}
			</select>

			<label className="mt-3 block text-sm" htmlFor="map-radius">
				Hiding radius — {props.hidingRadiusMeters} m
			</label>
			<input
				className="mt-1 min-h-11 w-full rounded border px-2"
				data-testid="map-radius"
				id="map-radius"
				min={50}
				onChange={(event) => props.onRadius(Number(event.target.value))}
				step={50}
				type="number"
				value={props.hidingRadiusMeters}
			/>
			<p className="mt-1 text-xs">
				Default for {props.scalePreset} is{" "}
				{SCALE_SETTINGS[props.scalePreset].hidingRadiusMeters} m. Changing it
				does not change the scale.
			</p>

			{props.roundRunning && (
				<p className="mt-3 text-sm" data-testid="apply-warning">
					A round is running. Applying a new map recomputes every search area.
					Committed hiding zones do not move.
				</p>
			)}

			<div className="mt-3 flex gap-2">
				<button
					className="min-h-11 flex-1 rounded border px-3"
					data-testid="map-save"
					disabled={!props.canSave || busy}
					onClick={props.onSave}
					type="button"
				>
					{props.state.kind === "saving" ? "Saving…" : "Save & share"}
				</button>
				<button
					className="min-h-11 flex-1 rounded border px-3"
					data-testid="map-apply"
					disabled={!props.canSave || busy}
					onClick={props.onApply}
					type="button"
				>
					{props.state.kind === "applying" ? "Applying…" : "Apply to game"}
				</button>
			</div>

			<SaveStatus state={props.state} />
		</section>
	);
}

function SaveStatus({ state }: { readonly state: SaveState }) {
	switch (state.kind) {
		case "saved":
			return (
				<p className="mt-2 text-sm" data-testid="map-code">
					Share code: <strong>{state.code}</strong>
				</p>
			);
		case "applied":
			return (
				<p className="mt-2 text-sm" data-testid="map-applied">
					Applied — {state.stopCount} stations carried.
					{state.catalogVersionChanged &&
						" The pinned catalog was superseded, so the current one was used."}
				</p>
			);
		case "failed":
			return (
				<p className="mt-2 text-sm" data-testid="map-error">
					{state.message}
				</p>
			);
		default:
			return null;
	}
}
