import { motion, useReducedMotion } from "motion/react";
import { glide } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * Where you are in a flow, drawn as track segments rather than "Step 2 of 4".
 *
 * Every setup path in this app is a wizard with one decision per screen, which
 * only works if the length of the path is visible from the first screen. The
 * completed segments fill left to right, so going back visibly rewinds.
 */

interface StepperProps {
	/** How many steps the flow has in total. */
	count: number;
	/** Zero-based index of the step being shown. */
	current: number;
	/** Names the flow for screen readers, e.g. "Create game". */
	label: string;
	className?: string;
}

export function Stepper({ count, current, label, className }: StepperProps) {
	const reduced = useReducedMotion();

	return (
		<div
			aria-label={`${label}: step ${current + 1} of ${count}`}
			aria-valuemax={count}
			aria-valuemin={1}
			aria-valuenow={current + 1}
			className={cn("flex items-center gap-1.5", className)}
			data-testid="stepper"
			role="progressbar"
		>
			{Array.from({ length: count }, (_, index) => {
				const done = index <= current;
				return (
					<div
						className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised"
						// biome-ignore lint/suspicious/noArrayIndexKey: steps are a fixed ordered set
						key={index}
					>
						<motion.div
							animate={{ scaleX: done ? 1 : 0 }}
							className="h-full origin-left rounded-full bg-action"
							initial={false}
							transition={reduced ? { duration: 0 } : glide}
						/>
					</div>
				);
			})}
		</div>
	);
}
