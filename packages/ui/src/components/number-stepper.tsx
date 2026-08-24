import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A number with a target either side of it.
 *
 * Not a text field: there is no keyboard to raise, no unit to type and no way
 * to enter something the setting cannot mean. The value stays readable while it
 * changes, which is the whole reason a host taps twice instead of typing.
 *
 * `suggested` is what something else proposed — a game size, a scale preset.
 * When the value has moved off it the control says so and offers the way back,
 * so experimenting with a number never costs the number you started from.
 */

interface NumberStepperProps {
	label: ReactNode;
	/** The value, already formatted with its unit. */
	value: ReactNode;
	onStep: (direction: 1 | -1) => void;
	canIncrease?: boolean;
	canDecrease?: boolean;
	/** What this was before a hand moved it, formatted the same way. */
	suggested?: { label: ReactNode; onRestore: () => void } | null;
	testId?: string;
}

export function NumberStepper({
	label,
	value,
	onStep,
	canIncrease = true,
	canDecrease = true,
	suggested,
	testId,
}: NumberStepperProps) {
	return (
		<div
			className={cn(
				"flex min-h-[4.4rem] items-center gap-2.5 rounded-control border bg-surface py-2 pr-2 pl-3.5",
				suggested ? "border-action bg-action/[0.07]" : "border-hairline",
			)}
			data-testid={testId}
		>
			<div className="min-w-0 flex-1">
				<div className="eyebrow">{label}</div>
				<div
					className="num mt-0.5 font-medium text-xl"
					data-testid={testId && `${testId}-value`}
				>
					{value}
				</div>
				{suggested && (
					<button
						className="mt-0.5 block font-mono text-[0.55rem] text-action uppercase tracking-[0.06em]"
						data-testid={testId && `${testId}-restore`}
						onClick={suggested.onRestore}
						type="button"
					>
						Back to {suggested.label}
					</button>
				)}
			</div>
			<StepButton
				disabled={!canDecrease}
				label={`Less ${typeof label === "string" ? label.toLowerCase() : ""}`}
				onClick={() => onStep(-1)}
				testId={testId && `${testId}-down`}
			>
				−
			</StepButton>
			<StepButton
				disabled={!canIncrease}
				label={`More ${typeof label === "string" ? label.toLowerCase() : ""}`}
				onClick={() => onStep(1)}
				testId={testId && `${testId}-up`}
			>
				+
			</StepButton>
		</div>
	);
}

interface StepButtonProps {
	children: ReactNode;
	label: string;
	onClick: () => void;
	disabled: boolean;
	testId?: string;
}

function StepButton({
	children,
	label,
	onClick,
	disabled,
	testId,
}: StepButtonProps) {
	return (
		<button
			aria-label={label}
			className={cn(
				"grid size-12 shrink-0 place-items-center rounded-control bg-surface-raised",
				"font-semibold text-ink text-xl",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90",
				"hover:bg-hairline-strong disabled:pointer-events-none disabled:opacity-35",
			)}
			data-testid={testId}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
