import { cn } from "../lib/utils";

interface SwitchProps {
	readonly on: boolean;
	readonly onChange: (on: boolean) => void;
	readonly label: string;
	/**
	 * Action by default. `live` where the thing being switched *is* a live
	 * state — the wake lock, a broadcast — so the track reads as the same green
	 * the rest of the app uses for "this is happening now".
	 */
	readonly tone?: "action" | "live";
	readonly disabled?: boolean;
	readonly testId?: string;
}

/**
 * A binary on the row, not a pair of words. The label is for the screen
 * reader; the track is what a thumb actually hits.
 *
 * A switch changes something now. Picking several things out of a list that
 * get applied later is a `Checkbox`, not four of these.
 */
export function Switch({
	on,
	onChange,
	label,
	tone = "action",
	disabled = false,
	testId,
}: SwitchProps) {
	return (
		<button
			aria-checked={on}
			aria-label={label}
			className={cn(
				"relative h-7 w-12 shrink-0 rounded-full",
				"transition-colors duration-[--dur-move] ease-[--ease-travel]",
				"disabled:pointer-events-none disabled:opacity-40",
				!on && "bg-surface-raised",
				on &&
					(tone === "live"
						? "bg-[color-mix(in_oklab,var(--live)_45%,transparent)]"
						: "bg-action"),
			)}
			data-testid={testId}
			disabled={disabled}
			onClick={() => onChange(!on)}
			role="switch"
			type="button"
		>
			<span
				className={cn(
					"absolute top-0.5 left-0.5 block size-6 rounded-full shadow-sm",
					// A 320ms throw: long enough to watch, which is what makes the
					// control feel like a physical thing rather than a repaint.
					"transition-[translate,background-color] duration-[320ms] ease-[--ease-pop]",
					on && tone === "live" ? "bg-live" : "bg-white",
					on && "translate-x-5",
				)}
			/>
		</button>
	);
}
