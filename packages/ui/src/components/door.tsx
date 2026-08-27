import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

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
	/** A single icon or character, never load-bearing on its own. */
	glyph: ReactNode;
	/** The second line: the consequence, in the player's terms. */
	hint?: ReactNode;
	/** Say that this returns to where it was opened from. */
	chevron?: boolean;
	/** The slow highlight, for the one door a screen is really offering. */
	beacon?: boolean;
	children: ReactNode;
}

export function Door({
	tone = "secondary",
	glyph,
	hint,
	chevron = false,
	beacon = false,
	className,
	children,
	...rest
}: DoorProps) {
	const primary = tone === "primary";

	return (
		<button
			className={cn(
				"zl-press group w-full rounded-[22px]",
				"hover:-translate-y-0.5",
				"disabled:pointer-events-none disabled:opacity-45",
				/*
				 * The depth is set on exactly one branch, never on both: two
				 * arbitrary-property utilities for the same custom property are
				 * resolved by their order in the generated stylesheet, not by the
				 * order they appear in the class string. A door's edge is deeper than
				 * a button's — the same 5px under an object this size would read as a
				 * printing misregistration — and a secondary door has none at all.
				 */
				primary
					? "[--press-depth:6px] [--press-edge:var(--action-press)]"
					: "[--press-depth:0px]",
				className,
			)}
			type="button"
			{...rest}
		>
			<span
				className={cn(
					"zl-press-face items-center gap-3.5 p-4 text-left",
					"group-active:translate-y-[3px]",
					primary
						? "bg-action text-action-ink"
						: "border-2 border-hairline-strong bg-surface text-ink",
					beacon && !rest.disabled && "zl-sheen",
				)}
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
					<Icon className="opacity-50" name="caret-right" size="sm" />
				)}
			</span>
		</button>
	);
}
