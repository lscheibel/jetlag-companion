import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeOnly, noticeArrive } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * Something the app needs to say, that the player can dismiss and forget.
 *
 * The shape this exists for: a teammate got there first, so the answer just
 * submitted was discarded. That message has to arrive, be readable at a
 * glance, and then go away — it is not an error, nothing needs retrying, and
 * it never turns into a log entry.
 *
 * Exit animation is the reason this is Motion: a notice that blinks out of
 * existence reads as a bug, and a dismissed one should be seen leaving.
 */

export type NoticeTone = "info" | "warn" | "danger";

interface NoticeProps {
	open: boolean;
	onDismiss: () => void;
	title: ReactNode;
	children?: ReactNode;
	tone?: NoticeTone;
	/** Label for the dismiss control. Keep it a plain acknowledgement. */
	dismissLabel?: string;
	testId?: string;
	className?: string;
}

const TONES: Record<NoticeTone, string> = {
	info: "border-l-transit-u",
	warn: "border-l-stale",
	danger: "border-l-danger",
};

export function Notice({
	open,
	onDismiss,
	title,
	children,
	tone = "info",
	dismissLabel = "Got it",
	testId = "notice",
	className,
}: NoticeProps) {
	const reduced = useReducedMotion();

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					animate="shown"
					className={cn(
						"flex flex-col gap-2 rounded-tile border border-hairline border-l-[5px] bg-surface-raised p-3",
						"shadow-[0_18px_30px_-18px_rgb(0_0_0/0.5)]",
						TONES[tone],
						className,
					)}
					data-testid={testId}
					exit="leaving"
					initial="hidden"
					role="status"
					variants={reduced ? fadeOnly : noticeArrive}
				>
					<div className="font-semibold text-[0.95rem] leading-tight">
						{title}
					</div>
					{children && (
						<div className="text-ink-dim text-xs leading-snug">{children}</div>
					)}
					<button
						className="min-h-tap self-end rounded-chip bg-surface px-4 font-mono text-[0.63rem] uppercase tracking-[0.08em] transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-95"
						data-testid={`${testId}-dismiss`}
						onClick={onDismiss}
						type="button"
					>
						{dismissLabel}
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
