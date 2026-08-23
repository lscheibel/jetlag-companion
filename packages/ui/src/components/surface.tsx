import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

/**
 * The panel everything sits on. One component rather than a Card with a
 * Header, a Content and a Footer, because the screens in this app are lists of
 * short facts and the ceremony was never used.
 *
 * `accent` draws the left edge in a team's colour — the shape the lobby, the
 * thread list and the constraint list all reach for.
 */

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
	/** Lift it off the ground: for panels floating over the map. */
	raised?: boolean;
	/** A colour for the leading edge, usually a team's. */
	accent?: string;
	/** Highlight it as the viewer's own: their team, their turn, their card. */
	mine?: boolean;
}

export function Surface({
	raised = false,
	accent,
	mine = false,
	className,
	style,
	children,
	...rest
}: SurfaceProps) {
	return (
		<div
			className={cn(
				"rounded-tile border border-hairline p-3",
				raised ? "bg-surface-raised shadow-black/20 shadow-lg" : "bg-surface",
				accent && "border-l-[5px]",
				mine && "border-action/40 bg-action/[0.07]",
				className,
			)}
			style={accent ? { borderLeftColor: accent, ...style } : style}
			{...rest}
		>
			{children}
		</div>
	);
}
