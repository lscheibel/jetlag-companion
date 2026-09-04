import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "../lib/utils";

/**
 * Confirm by holding, not by tapping.
 *
 * For the few actions that commit a whole team at once — declaring ready,
 * starting the round — where an accidental brush against a phone in a pocket
 * would land on everybody. The fill is the confirmation: let go early and
 * nothing happened, which is a friendlier undo than a dialog asking whether
 * you meant it.
 *
 * Not a substitute for a confirm on anything destructive; there is nothing
 * here to undo, only something to start.
 */

interface HoldButtonProps {
	onConfirm: () => void;
	children: ReactNode;
	/** Second line, smaller: what completing the hold will start. */
	hint?: ReactNode;
	/** How long the hold takes. Long enough to be deliberate, short enough to
	 *  not feel like a punishment. */
	durationMs?: number;
	tone?: "primary" | "live";
	disabled?: boolean;
	testId?: string;
	className?: string;
}

export function HoldButton({
	onConfirm,
	children,
	hint,
	durationMs = 700,
	tone = "primary",
	disabled = false,
	testId,
	className,
}: HoldButtonProps) {
	const reduced = useReducedMotion();
	const [holding, setHolding] = useState(false);
	/** Set for one animation the moment the hold completes, then cleared. */
	const [confirmed, setConfirmed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const stop = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		setHolding(false);
	}, []);

	const start = useCallback(() => {
		if (disabled || timer.current) return;
		setHolding(true);
		timer.current = setTimeout(() => {
			stop();
			setConfirmed(true);
			onConfirm();
		}, durationMs);
	}, [disabled, durationMs, onConfirm, stop]);

	return (
		<button
			className={cn(
				"zl-press group w-full rounded-[20px]",
				// Lifted on its own darker edge, like every other action: over a dark
				// ground a black shadow is no shadow at all.
				tone === "live"
					? "[--press-edge:var(--edge-live)]"
					: "[--press-edge:var(--action-press)]",
				"disabled:pointer-events-none disabled:opacity-45 disabled:[--press-edge:transparent]",
				confirmed && "zl-pop",
				className,
			)}
			data-holding={holding || undefined}
			data-testid={testId}
			disabled={disabled}
			onAnimationEnd={() => setConfirmed(false)}
			onBlur={stop}
			onContextMenu={(event) => event.preventDefault()}
			onPointerCancel={stop}
			onPointerDown={start}
			onPointerLeave={stop}
			onPointerUp={stop}
			type="button"
		>
			<span
				className={cn(
					"zl-press-face min-h-tap-primary px-5",
					"font-display font-extrabold text-lg tracking-tight",
					hint && "flex-col gap-0.5 py-3",
					"group-active:translate-y-[3px]",
					tone === "live" ? "bg-live text-white" : "bg-action text-action-ink",
					// Findable in peripheral vision, and only while it is waiting to be
					// held: a sweep across a button that is filling would read as part of
					// the fill.
					!holding && !disabled && "zl-sheen",
					// The fill has to be clipped to the face even when the sheen is off.
					"overflow-hidden",
				)}
			>
				{/*
				 * The fill sits behind the label and is purely a progress read-out, so
				 * a player who cannot see it still gets the same behaviour from the
				 * same hold. Ink rather than white: on the live green a white wash
				 * washes the label out with it. With reduced motion it snaps rather
				 * than sweeps.
				 */}
				<motion.span
					animate={{ scaleX: holding ? 1 : 0 }}
					aria-hidden
					className="absolute inset-0 origin-left bg-black/[0.17]"
					initial={false}
					transition={
						reduced
							? { duration: 0 }
							: { duration: holding ? durationMs / 1000 : 0.18, ease: "linear" }
					}
				/>
				<span className="relative flex items-center gap-2">{children}</span>
				{hint && (
					<span className="relative font-medium font-mono text-[0.6rem] uppercase leading-none tracking-[0.1em] opacity-70">
						{hint}
					</span>
				)}
			</span>
		</button>
	);
}
