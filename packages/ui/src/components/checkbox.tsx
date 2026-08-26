import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/utils";

/**
 * Picking several things out of a list.
 *
 * Not a Switch, which is the control the transit step reached for before this
 * existed: a switch promises the change happens now, and the modes it was
 * switching are applied at review. A checkbox picks; a switch acts.
 *
 * Over a real `<input type="checkbox">`, so form semantics, the space bar and
 * the screen reader's own announcement come free rather than being
 * reimplemented three quarters of the way.
 */

interface CheckboxProps
	extends Omit<
		InputHTMLAttributes<HTMLInputElement>,
		"id" | "type" | "size" | "children"
	> {
	label: ReactNode;
	/** What choosing it means, in the player's terms. */
	hint?: ReactNode;
	/** A mark, badge or icon between the box and the label. */
	leading?: ReactNode;
	/** Some but not all of what this row stands for. Draws a dash. */
	indeterminate?: boolean;
	testId?: string;
}

export function Checkbox({
	label,
	hint,
	leading,
	indeterminate = false,
	checked = false,
	disabled = false,
	testId,
	className,
	...rest
}: CheckboxProps) {
	const id = useId();
	const state = disabled
		? "disabled"
		: indeterminate
			? "mixed"
			: checked
				? "on"
				: "off";

	return (
		<label
			className={cn(
				"flex min-h-tap-comfortable cursor-pointer items-center gap-3 rounded-control border px-3 py-2",
				"bg-surface transition-[border-color,opacity] duration-[--dur-tap]",
				"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
				checked || indeterminate
					? "border-[color-mix(in_oklab,var(--action)_55%,var(--hairline))]"
					: "border-hairline opacity-60",
				disabled && "pointer-events-none opacity-40",
				className,
			)}
			data-on={checked}
			data-testid={testId}
			htmlFor={id}
		>
			<input
				aria-checked={indeterminate ? "mixed" : checked}
				checked={checked}
				className="sr-only"
				disabled={disabled}
				id={id}
				type="checkbox"
				{...rest}
			/>
			<CheckMark state={state} />
			{leading}
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-sm leading-tight">
					{label}
				</span>
				{hint && <span className="eyebrow mt-0.5 block">{hint}</span>}
			</span>
		</label>
	);
}

type CheckState = "off" | "on" | "mixed" | "disabled";

/**
 * The box itself. The tick draws itself along its own length rather than
 * fading in, so at a glance it reads as a mark being made rather than as a
 * shape appearing — and the box pops on the frame it is checked.
 */
function CheckMark({ state }: { readonly state: CheckState }) {
	const marked = state === "on" || state === "mixed";
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-[9px] border-2",
				"transition-[background-color,border-color] duration-[--dur-tap]",
				marked
					? "border-action bg-action"
					: "border-hairline-strong bg-surface",
				state === "on" && "zl-pop",
			)}
			data-state={state}
		>
			<svg
				className={cn(
					"size-[18px] transition-[stroke-dashoffset] duration-[--dur-move] ease-[--ease-out-soft]",
					marked ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:24]",
				)}
				fill="none"
				stroke="var(--action-ink)"
				strokeDasharray="24"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="3"
				viewBox="0 0 24 24"
			>
				<title>{state === "mixed" ? "Partly chosen" : "Chosen"}</title>
				{state === "mixed" ? (
					<path d="M6 12h12" />
				) : (
					<path d="M5 12.5l4.5 4.5L19 7" />
				)}
			</svg>
		</span>
	);
}
