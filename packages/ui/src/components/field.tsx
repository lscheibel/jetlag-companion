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

/**
 * `size` is taken from the native attribute, which is a legacy character-count
 * hint no screen in this app has ever wanted and which reads as a component
 * size everywhere else in the kit.
 */
interface FieldProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "size"> {
	label: ReactNode;
	hint?: ReactNode;
	/** What to fix, in the player's words. Replaces the hint while set. */
	problem?: ReactNode;
	/** Rendered inside the control on the trailing edge: a unit, a counter. */
	trailing?: ReactNode;
	/**
	 * `display` is the shape a screen with one question uses: taller, and the
	 * answer set in the display face at the size the rest of the app reserves
	 * for headings, because on that screen the answer *is* the heading.
	 */
	size?: "default" | "display";
}

export function Field({
	label,
	hint,
	problem,
	trailing,
	size = "default",
	className,
	...rest
}: FieldProps) {
	const id = useId();
	const describedBy = problem || hint ? `${id}-note` : undefined;

	return (
		<div className="flex flex-col gap-1.5">
			<div
				className={cn(
					"flex items-center gap-3 rounded-tile border-2 px-3.5 py-2",
					"bg-surface transition-colors focus-within:border-action",
					"focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--action)_14%,transparent)]",
					size === "display" ? "min-h-22 rounded-[20px]" : "min-h-tap-primary",
					problem ? "border-danger" : "border-hairline-strong",
					// A field that is showing a value set somewhere else is dimmed
					// rather than styled as broken: it is not wrong, it is not here.
					rest.readOnly && "opacity-50",
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
						className={cn(
							"w-full bg-transparent text-ink outline-none placeholder:text-ink-faint",
							size === "display"
								? "font-display font-extrabold text-2xl tracking-tight"
								: "font-medium text-base",
						)}
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
