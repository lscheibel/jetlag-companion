import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A control that stays pressed.
 *
 * One component for the three strips that used to draw their own: the area
 * editor's tools, the transit filter row and the map's mode pair. The pressed
 * state is `aria-pressed`, never a class alone — it has to reach a screen
 * reader, because "which tool am I holding" is the question the strip exists
 * to answer.
 *
 * Nothing is coloured until it is active, and only the active one has a
 * border, so a strip at rest has a single outline in it rather than four.
 */

export type TogglePressedTone = "action" | "add" | "cut";

interface ToggleButtonProps {
	pressed: boolean;
	onClick: () => void;
	children: ReactNode;
	/** A glyph above the label, never load-bearing on its own. */
	icon?: ReactNode;
	/** What being pressed means: choosing, adding to an area, cutting from it. */
	tone?: TogglePressedTone;
	/**
	 * `tile` is the stacked cell of a tool strip. `bar` is the wide half of a
	 * mode pair — icon and label side by side on a shared surface.
	 */
	shape?: "tile" | "bar";
	disabled?: boolean;
	testId?: string;
	className?: string;
}

const PRESSED: Record<TogglePressedTone, string> = {
	action:
		"border-action bg-[color-mix(in_oklab,var(--action)_16%,var(--surface))] font-bold text-ink",
	add: "border-[color-mix(in_oklab,var(--live)_45%,transparent)] bg-[color-mix(in_oklab,var(--live)_20%,transparent)] font-bold text-live",
	cut: "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_20%,transparent)] font-bold text-danger",
};

export function ToggleButton({
	pressed,
	onClick,
	children,
	icon,
	tone = "action",
	shape = "tile",
	disabled = false,
	testId,
	className,
}: ToggleButtonProps) {
	return (
		<button
			aria-pressed={pressed}
			className={cn(
				"flex min-h-tap min-w-0 flex-1 items-center justify-center border-[1.5px] border-transparent",
				"font-mono text-ink-dim uppercase",
				"transition-[scale,background-color,color,border-color] duration-[--dur-tap] ease-[--ease-pop]",
				"active:scale-[0.93] active:duration-[--dur-press]",
				"disabled:pointer-events-none disabled:opacity-40",
				shape === "tile"
					? "flex-col gap-1 rounded-[15px] bg-surface px-1 py-2 text-[0.6rem] tracking-[0.05em]"
					: // A bar carries its own surface so it still reads as a control when
						// it stands alone in a strip; inside a mode pair that surface is the
						// same colour as the pair's, so the two halves stay one object.
						"gap-[7px] rounded-[11px] bg-surface px-2 text-[0.66rem] tracking-[0.08em]",
				pressed && PRESSED[tone],
				className,
			)}
			data-testid={testId}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{icon}
			<span className="truncate">{children}</span>
		</button>
	);
}

/**
 * A strip of tools, one held at a time. A row rather than a container with
 * opinions: what makes it read as a tool rather than as a filter is that only
 * one of its children is ever pressed.
 */
export function ToggleStrip({
	children,
	testId,
	className,
}: {
	readonly children: ReactNode;
	readonly testId?: string;
	readonly className?: string;
}) {
	return (
		<div className={cn("flex gap-1.5", className)} data-testid={testId}>
			{children}
		</div>
	);
}

/**
 * Two halves of one decision, held on a shared surface rather than inside an
 * outline — so the pair reads as one control with a side chosen, not as two
 * separate buttons that happen to be adjacent.
 */
export function ToggleModePair({
	children,
	testId,
	className,
}: {
	readonly children: ReactNode;
	readonly testId?: string;
	readonly className?: string;
}) {
	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-1 rounded-[15px] bg-surface p-1",
				className,
			)}
			data-testid={testId}
		>
			{children}
		</div>
	);
}
