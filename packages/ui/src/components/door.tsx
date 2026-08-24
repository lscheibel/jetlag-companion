import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A way into a flow: a glyph, what it is, and what happens if you go through.
 *
 * Distinct from `ActionButton` because it is not the end of a screen — it is a
 * choice between paths, and the second line is what makes the choice without a
 * tap. The start screen is two of these, and the difference between the loud
 * one and the quiet one is the whole design of that screen: nearly everybody
 * arriving at a door is opening a game, so create carries the shadow and typing
 * a code stands beside it.
 *
 * `chevron` marks a door that comes back — a detour that hands its result to
 * the screen you left, rather than somewhere the flow sends you and forgets.
 */

interface DoorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	tone?: "primary" | "secondary";
	/** A single character or icon, never load-bearing on its own. */
	glyph: ReactNode;
	/** The second line: the consequence, in the player's terms. */
	hint?: ReactNode;
	/** Say that this returns to where it was opened from. */
	chevron?: boolean;
	children: ReactNode;
}

export function Door({
	tone = "secondary",
	glyph,
	hint,
	chevron = false,
	className,
	children,
	...rest
}: DoorProps) {
	const primary = tone === "primary";

	return (
		<button
			className={cn(
				"flex w-full items-center gap-3.5 rounded-[22px] p-4 text-left",
				"transition-[transform,box-shadow] duration-[--dur-tap] ease-[--ease-pop]",
				"hover:-translate-y-0.5 active:translate-y-1",
				"disabled:pointer-events-none disabled:opacity-45",
				primary
					? "bg-action text-action-ink shadow-[0_6px_0_var(--action-press)] hover:shadow-[0_9px_0_var(--action-press)] active:shadow-[0_2px_0_var(--action-press)]"
					: "border-2 border-hairline-strong bg-surface text-ink",
				className,
			)}
			type="button"
			{...rest}
		>
			<span
				aria-hidden
				className={cn(
					"grid size-13 shrink-0 place-items-center rounded-[17px] text-2xl",
					primary ? "bg-black/15" : "bg-surface-raised",
				)}
			>
				{glyph}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-display font-extrabold text-[1.2rem] leading-tight tracking-tight">
					{children}
				</span>
				{hint && (
					<span className="mt-0.5 block text-[0.78rem] leading-snug opacity-75">
						{hint}
					</span>
				)}
			</span>
			{chevron && (
				<span aria-hidden className="text-ink-faint text-lg">
					›
				</span>
			)}
		</button>
	);
}
