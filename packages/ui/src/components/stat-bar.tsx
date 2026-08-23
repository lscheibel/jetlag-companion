import { motion, useReducedMotion } from "motion/react";
import { glide } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * A proportion, with the newest contribution called out separately.
 *
 * Two segments rather than one, because "72% of the area is gone" and "the last
 * answer took 18% of it" are different facts and the second is the one that
 * tells a seeker whether the question they just asked was worth asking. The
 * same shape carries readiness in the lobby: how many teams are ready, and who
 * just became ready.
 */

interface StatBarProps {
	/** Everything accounted for before the most recent contribution, 0–1. */
	settled: number;
	/** The most recent contribution, 0–1. Drawn in the action colour. */
	latest?: number;
	label?: string;
	className?: string;
}

export function StatBar({
	settled,
	latest = 0,
	label,
	className,
}: StatBarProps) {
	const reduced = useReducedMotion();
	const total = Math.min(1, Math.max(0, settled + latest));

	return (
		<div
			aria-label={label}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={Math.round(total * 100)}
			className={cn(
				"flex h-3 w-full overflow-hidden rounded-full bg-surface-raised",
				className,
			)}
			role="progressbar"
		>
			<motion.div
				animate={{ width: `${Math.min(1, Math.max(0, settled)) * 100}%` }}
				className="h-full bg-hairline-strong"
				initial={false}
				transition={reduced ? { duration: 0 } : glide}
			/>
			<motion.div
				animate={{ width: `${Math.min(1, Math.max(0, latest)) * 100}%` }}
				className="h-full bg-action"
				initial={false}
				transition={reduced ? { duration: 0 } : { ...glide, delay: 0.08 }}
			/>
		</div>
	);
}
