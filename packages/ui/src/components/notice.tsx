import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeOnly, noticeArrive } from "../lib/motion";
import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";

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

/**
 * The same thing said in the flow rather than over it.
 *
 * An inline notice sits beside what it is about and stays as long as its
 * condition does, so it has no `open` and usually no dismiss: a standing
 * condition — "answers are visible to everybody" — gets no button, because
 * tapping it would be a lie. It carries no shadow either; it is part of the
 * page, not something that arrived on top of it.
 */

interface InlineNoticeProps {
	title: ReactNode;
	children?: ReactNode;
	tone?: NoticeTone;
	/** Only where the player can actually make the thing go away. */
	onDismiss?: () => void;
	dismissLabel?: string;
	testId?: string;
	className?: string;
}

const INLINE_TONES: Record<NoticeTone, string> = {
	info: "border-l-transit-u bg-[color-mix(in_oklab,var(--transit-u)_11%,transparent)]",
	warn: "border-l-stale bg-[color-mix(in_oklab,var(--stale)_12%,transparent)]",
	danger:
		"border-l-danger bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
};

const INLINE_GLYPH: Record<NoticeTone, string> = {
	info: "text-transit-u",
	warn: "text-stale",
	danger: "text-danger",
};

const INLINE_ICON: Record<NoticeTone, IconName> = {
	info: "info",
	warn: "warning",
	danger: "prohibit",
};

export function InlineNotice({
	title,
	children,
	tone = "info",
	onDismiss,
	dismissLabel = "Got it",
	testId,
	className,
}: InlineNoticeProps) {
	return (
		<div
			className={cn(
				"flex items-start gap-2.5 rounded-xl border-l-[3px] px-3 py-2.5",
				INLINE_TONES[tone],
				className,
			)}
			data-testid={testId}
			role="status"
		>
			<span className={cn("mt-px", INLINE_GLYPH[tone])}>
				<Icon name={INLINE_ICON[tone]} size="sm" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="font-semibold text-[0.85rem] leading-tight">
					{title}
				</div>
				{children && (
					<div className="mt-0.5 text-ink-dim text-xs leading-snug">
						{children}
					</div>
				)}
			</div>
			{onDismiss && (
				<button
					className="min-h-9 shrink-0 self-center rounded-chip bg-surface px-3 font-mono text-[0.63rem] uppercase tracking-[0.08em] transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-95"
					data-testid={testId && `${testId}-dismiss`}
					onClick={onDismiss}
					type="button"
				>
					{dismissLabel}
				</button>
			)}
		</div>
	);
}
