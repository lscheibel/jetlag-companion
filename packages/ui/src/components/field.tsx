import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/utils";

/**
 * A labelled input, sized for a thumb and never smaller.
 *
 * The label sits inside the control rather than above it, so a screen full of
 * fields still reads as a list of tall targets. `hint` is where the explanation
 * goes; `problem` replaces it when something is wrong, and says what to do
 * rather than what failed.
 */

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
	label: ReactNode;
	hint?: ReactNode;
	/** What to fix, in the player's words. Replaces the hint while set. */
	problem?: ReactNode;
	/** Rendered inside the control on the trailing edge: a unit, a counter. */
	trailing?: ReactNode;
}

export function Field({
	label,
	hint,
	problem,
	trailing,
	className,
	...rest
}: FieldProps) {
	const id = useId();
	const describedBy = problem || hint ? `${id}-note` : undefined;

	return (
		<div className="flex flex-col gap-1.5">
			<div
				className={cn(
					"flex min-h-tap-primary items-center gap-3 rounded-tile border-2 px-3.5 py-2",
					"bg-surface transition-colors focus-within:border-action",
					problem ? "border-danger" : "border-hairline-strong",
					className,
				)}
			>
				<div className="min-w-0 flex-1">
					<label className="eyebrow block" htmlFor={id}>
						{label}
					</label>
					<input
						aria-describedby={describedBy}
						aria-invalid={problem ? true : undefined}
						className="w-full bg-transparent font-medium text-base text-ink outline-none placeholder:text-ink-faint"
						id={id}
						{...rest}
					/>
				</div>
				{trailing}
			</div>
			{(problem || hint) && (
				<p
					className={cn(
						"px-1 text-xs leading-snug",
						problem ? "text-danger" : "text-ink-dim",
					)}
					id={describedBy}
				>
					{problem ?? hint}
				</p>
			)}
		</div>
	);
}
