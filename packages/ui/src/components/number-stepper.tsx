import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

/**
 * A number with a target either side of it.
 *
 * Not a text field by default: there is no keyboard to raise, no unit to type
 * and no way to enter something the setting cannot mean. The value stays
 * readable while it changes, which is the whole reason a host taps twice
 * instead of typing.
 *
 * `suggested` is what something else proposed — a game size, a scale preset.
 * When the value has moved off it the control says so and offers the way back,
 * so experimenting with a number never costs the number you started from.
 */

interface BaseProps {
	label: ReactNode;
	onStep: (direction: 1 | -1) => void;
	canIncrease?: boolean;
	canDecrease?: boolean;
	/** What this was before a hand moved it, formatted the same way. */
	suggested?: { label: ReactNode; onRestore: () => void } | null;
	testId?: string;
}

/**
 * The typed variant is a separate shape rather than a flag, because a value
 * that can be typed is a string the caller has to parse and a value that
 * cannot is anything at all. Reach for it only where a number is genuinely
 * typed — a big one, or one a host arrives with in their head.
 */
type NumberStepperProps = BaseProps &
	(
		| { value: ReactNode; onCommit?: undefined; unit?: undefined }
		| {
				value: string;
				onCommit: (raw: string) => void;
				/** Sits after the field: "per team", "min". */
				unit?: ReactNode;
		  }
	);

export function NumberStepper({
	label,
	value,
	onStep,
	canIncrease = true,
	canDecrease = true,
	suggested,
	onCommit,
	unit,
	testId,
}: NumberStepperProps) {
	/** Which way the figure last moved, so it can roll in from that side. */
	const [roll, setRoll] = useState<{ direction: 1 | -1; nonce: number } | null>(
		null,
	);
	/**
	 * What is in the field while it is being typed. Committed on blur / Enter,
	 * discarded on Escape, so a min of 100 m does not swallow the "1" of "1200".
	 */
	const [draft, setDraft] = useState<string | null>(null);

	function step(direction: 1 | -1) {
		setDraft(null);
		setRoll((previous) => ({
			direction,
			nonce: (previous?.nonce ?? 0) + 1,
		}));
		onStep(direction);
	}

	function commitDraft() {
		if (draft === null || !onCommit) return;
		onCommit(draft);
		setDraft(null);
	}

	return (
		<div
			className={cn(
				"flex min-h-[70px] items-center gap-2.5 rounded-control border py-2 pr-2 pl-3.5",
				suggested
					? "border-action bg-[color-mix(in_oklab,var(--action)_7%,transparent)]"
					: "border-hairline bg-surface",
			)}
			data-testid={testId}
		>
			<div className="min-w-0 flex-1">
				<div className="eyebrow">{label}</div>
				{onCommit ? (
					<div className="flex items-center gap-1.5">
						<input
							autoComplete="off"
							className="num w-full min-w-0 bg-transparent font-medium text-ink text-xl outline-none"
							data-testid={testId && `${testId}-value`}
							enterKeyHint="done"
							inputMode="numeric"
							onBlur={commitDraft}
							onChange={(event) => setDraft(event.target.value)}
							onFocus={(event) => {
								setDraft(value);
								event.currentTarget.select();
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitDraft();
									event.currentTarget.blur();
								}
								if (event.key === "Escape") {
									setDraft(null);
									event.currentTarget.blur();
								}
							}}
							value={draft ?? value}
						/>
						{unit && (
							<span className="shrink-0 font-mono text-ink-faint text-xs">
								{unit}
							</span>
						)}
					</div>
				) : (
					<div
						className={cn(
							"num mt-0.5 select-none font-medium text-xl",
							roll?.direction === 1 && "zl-roll-up",
							roll?.direction === -1 && "zl-roll-down",
						)}
						data-testid={testId && `${testId}-value`}
						// Restarting the animation is what makes a second tap in the same
						// direction roll again rather than sit still.
						key={roll?.nonce ?? 0}
					>
						{value}
					</div>
				)}
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
				onClick={() => step(-1)}
				testId={testId && `${testId}-down`}
			>
				<Icon name="minus" size="md" weight="bold" />
			</StepButton>
			<StepButton
				disabled={!canIncrease}
				label={`More ${typeof label === "string" ? label.toLowerCase() : ""}`}
				onClick={() => step(1)}
				testId={testId && `${testId}-up`}
			>
				<Icon name="plus" size="md" weight="bold" />
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
				"grid size-12 shrink-0 select-none place-items-center rounded-control bg-surface-raised",
				"font-semibold text-ink",
				"transition-[scale,background-color] duration-[--dur-press] ease-[--ease-pop]",
				"active:scale-90",
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
