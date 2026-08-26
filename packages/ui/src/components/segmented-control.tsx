import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/utils";

/**
 * Switching what you are looking at — not choosing what to submit.
 *
 * That is the whole difference from `ChoiceGroup`: a segmented control filters
 * a view the instant it is tapped, and a radio group is an answer that gets
 * submitted later. Same markup, different promise, so they are different
 * components rather than a `variant` on one.
 *
 * The thumb travels; it does not cut. Travel is what makes three buttons read
 * as one control, and it moves on `--ease-travel` rather than the house pop
 * curve — a thumb that bounces past its segment reads as a mis-tap.
 */

export interface SegmentOption<T extends string> {
	value: T;
	label: ReactNode;
	/** A figure under the label: how many things are behind this segment. */
	count?: ReactNode;
	/** Required when the label is an icon alone. */
	srLabel?: string;
	disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
	options: readonly SegmentOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Names the control for a screen reader, e.g. "Which side". */
	label: string;
	/** `pill` stands on its own; `boxy` sits inside a card. */
	shape?: "pill" | "boxy";
	testId?: string;
	className?: string;
}

export function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
	label,
	shape = "pill",
	testId,
	className,
}: SegmentedControlProps<T>) {
	const reduced = useReducedMotion();
	// One id per instance, so two controls on a screen do not share a thumb.
	const thumbId = useId();

	return (
		<fieldset
			className={cn(
				"relative flex gap-0.5 bg-surface p-1",
				shape === "pill" ? "rounded-chip" : "rounded-[15px]",
				className,
			)}
			data-testid={testId}
		>
			<legend className="sr-only">{label}</legend>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						aria-label={option.srLabel}
						aria-pressed={selected}
						className={cn(
							"relative flex min-h-tap min-w-0 flex-1 flex-col items-center justify-center px-3",
							"font-mono text-[0.66rem] uppercase leading-tight tracking-[0.09em]",
							"transition-colors duration-[--dur-tap]",
							shape === "pill" ? "rounded-chip" : "rounded-[11px]",
							selected ? "font-bold text-action-ink" : "text-ink-dim",
							option.disabled && "pointer-events-none opacity-40",
						)}
						data-testid={testId ? `${testId}-${option.value}` : undefined}
						disabled={option.disabled}
						key={option.value}
						onClick={() => onChange(option.value)}
						type="button"
					>
						{selected && (
							<motion.span
								aria-hidden
								className={cn(
									"absolute inset-0 bg-action",
									shape === "pill" ? "rounded-chip" : "rounded-[11px]",
								)}
								layoutId={thumbId}
								transition={
									reduced
										? { duration: 0 }
										: { duration: 0.26, ease: [0.32, 0.72, 0.28, 1] }
								}
							/>
						)}
						<span className="relative">{option.label}</span>
						{option.count !== undefined && (
							<span className="relative mt-px text-[0.56rem] leading-none tracking-[0.02em] opacity-70">
								{option.count}
							</span>
						)}
					</button>
				);
			})}
		</fieldset>
	);
}
