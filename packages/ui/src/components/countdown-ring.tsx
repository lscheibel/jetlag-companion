import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A deadline, drawn.
 *
 * Displayed, never enforced: the ring runs out and the question stays
 * answerable, because the app does not police a rule the players agreed on.
 * What the ring is for is knowing, at arm's length, whether there is time to
 * walk somewhere before answering.
 *
 * The arc is driven by a prop rather than a timer of its own — the elapsed
 * time that matters is measured on the answering device, and this component
 * has no business owning it.
 */

interface CountdownRingProps {
	/** How much of the ring is left, 0–1. */
	remaining: number;
	/** What to show inside: usually a formatted time, sometimes a percentage. */
	children: ReactNode;
	size?: number;
	/** Turns the ring to the warning colour, e.g. under a minute left. */
	urgent?: boolean;
	label?: string;
	className?: string;
}

export function CountdownRing({
	remaining,
	children,
	size = 96,
	urgent = false,
	label,
	className,
}: CountdownRingProps) {
	const radius = 42;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.min(1, Math.max(0, remaining));

	return (
		<div
			className={cn("relative shrink-0", className)}
			style={{ width: size, height: size }}
		>
			<svg
				className="-rotate-90"
				height={size}
				role="img"
				viewBox="0 0 96 96"
				width={size}
			>
				<title>{label ?? "Time remaining"}</title>
				<circle
					className="stroke-surface-raised"
					cx="48"
					cy="48"
					fill="none"
					r={radius}
					strokeWidth="9"
				/>
				<circle
					className={cn(
						"transition-[stroke-dashoffset] duration-[--dur-move] ease-linear",
						urgent ? "stroke-danger" : "stroke-action",
					)}
					cx="48"
					cy="48"
					fill="none"
					r={radius}
					strokeDasharray={circumference}
					strokeDashoffset={circumference * (1 - clamped)}
					strokeLinecap="round"
					strokeWidth="9"
				/>
			</svg>
			<div className="num absolute inset-0 grid place-items-center text-lg">
				{children}
			</div>
		</div>
	);
}
