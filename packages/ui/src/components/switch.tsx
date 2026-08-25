import { cn } from "../lib/utils";

interface SwitchProps {
	readonly on: boolean;
	readonly onChange: (on: boolean) => void;
	readonly label: string;
	readonly testId?: string;
}

/**
 * A binary on the row, not a pair of words. The label is for the screen
 * reader; the track is what a thumb actually hits.
 */
export function Switch({ on, onChange, label, testId }: SwitchProps) {
	return (
		<button
			aria-checked={on}
			aria-label={label}
			className={cn(
				"relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[--dur-press] ease-[--ease-pop]",
				on ? "bg-action" : "bg-surface-raised",
			)}
			data-testid={testId}
			onClick={() => onChange(!on)}
			role="switch"
			type="button"
		>
			<span
				className={cn(
					"absolute top-0.5 left-0.5 block size-6 rounded-full bg-white shadow-sm",
					"transition-transform duration-[--dur-press] ease-[--ease-pop]",
					on && "translate-x-5",
				)}
			/>
		</button>
	);
}
