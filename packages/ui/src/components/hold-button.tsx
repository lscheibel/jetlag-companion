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
	durationMs = 700,
	tone = "primary",
	disabled = false,
	testId,
	className,
}: HoldButtonProps) {
	const reduced = useReducedMotion();
	const [holding, setHolding] = useState(false);
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
			onConfirm();
		}, durationMs);
	}, [disabled, durationMs, onConfirm, stop]);

	return (
		<button
			className={cn(
				"relative min-h-tap-primary w-full overflow-hidden rounded-[20px] px-5",
				"font-display font-extrabold text-lg tracking-tight",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:translate-y-1",
				"disabled:pointer-events-none disabled:opacity-45",
				tone === "live"
					? "bg-live text-white shadow-[0_5px_0_rgb(0_0_0/0.3)]"
					: "bg-action text-action-ink shadow-[0_5px_0_var(--action-press)]",
				className,
			)}
			data-holding={holding || undefined}
			data-testid={testId}
			disabled={disabled}
			onBlur={stop}
			onContextMenu={(event) => event.preventDefault()}
			onPointerCancel={stop}
			onPointerDown={start}
			onPointerLeave={stop}
			onPointerUp={stop}
			type="button"
		>
			{/*
			 * The fill sits behind the label and is purely a progress read-out, so
			 * a player who cannot see it still gets the same behaviour from the
			 * same hold. With reduced motion it snaps rather than sweeps.
			 */}
			<motion.span
				animate={{ scaleX: holding ? 1 : 0 }}
				aria-hidden
				className="absolute inset-0 origin-left bg-white/25"
				initial={false}
				transition={
					reduced
						? { duration: 0 }
						: { duration: holding ? durationMs / 1000 : 0.18, ease: "linear" }
				}
			/>
			<span className="relative">{children}</span>
		</button>
	);
}
