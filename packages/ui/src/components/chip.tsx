import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A small piece of status, always with a word in it.
 *
 * The tones are the states the game actually has — live, stale, offline —
 * rather than a colour vocabulary, so that a chip cannot be given a colour
 * whose meaning nobody agreed on. Staleness in particular is always opacity
 * *and* words: a faded marker is never left to imply it alone.
 */

export type ChipTone =
	| "neutral"
	| "live"
	| "stale"
	| "offline"
	| "action"
	| "curse";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
	tone?: ChipTone;
	/** Show a small dot before the label; it breathes for `live`. */
	dot?: boolean;
	icon?: ReactNode;
}

const TONES: Record<ChipTone, string> = {
	neutral: "bg-surface-raised text-ink-dim",
	live: "bg-live/15 text-live",
	stale: "bg-stale/15 text-stale",
	offline: "bg-offline/15 text-offline",
	action: "bg-action text-action-ink font-bold",
	curse: "bg-curse/20 text-curse",
};

export function Chip({
	tone = "neutral",
	dot = false,
	icon,
	className,
	children,
	...rest
}: ChipProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1",
				"font-mono text-[0.63rem] uppercase leading-none tracking-[0.08em]",
				TONES[tone],
				className,
			)}
			{...rest}
		>
			{dot && (
				<span
					aria-hidden
					className={cn(
						"size-1.5 shrink-0 rounded-full bg-current",
						tone === "live" && "zl-breathe",
					)}
				/>
			)}
			{icon}
			{children}
		</span>
	);
}
