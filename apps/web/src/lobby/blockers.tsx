import { Chip } from "@zero-lag/ui/components/chip";
import { Icon } from "@zero-lag/ui/components/icon";
import { fadeOnly, listContainer, listItem } from "@zero-lag/ui/lib/motion";
import { motion, useReducedMotion } from "motion/react";
import { type Blocker, blockerText } from "./model";

/**
 * What stands between this lobby and a game, one card each.
 *
 * One card per thing rather than a list inside a box: they are unrelated
 * problems with unrelated fixes, and stacking them into a single panel makes
 * four separate jobs look like one warning to skim past. Each names the thing
 * rather than the rule — "Haie has nobody on it" beats "invalid configuration"
 * — and each is a tap to the place that fixes it.
 */

interface BlockerCardsProps {
	blockers: readonly Blocker[];
	onFix: (blocker: Blocker) => void;
	/** Only somebody who can fix them gets them as buttons. */
	actionable: boolean;
}

export function BlockerCards({
	blockers,
	onFix,
	actionable,
}: BlockerCardsProps) {
	const reduced = useReducedMotion();

	return (
		<motion.div
			animate="shown"
			className="flex flex-col gap-1.5"
			data-testid="start-blocked"
			initial="hidden"
			variants={listContainer}
		>
			{blockers.map((blocker) => {
				const text = blockerText(blocker);
				const body = (
					<>
						<span aria-hidden className="shrink-0 text-stale">
							<Icon name="warning" size="xs" />
						</span>
						<span className="min-w-0 flex-1">{text}</span>
						{actionable && <Chip tone="action">Fix</Chip>}
					</>
				);

				return (
					<motion.div
						className="flex items-center gap-2.5 rounded-tile border border-stale/40 bg-stale/10 text-[0.8rem] leading-tight"
						key={text}
						variants={reduced ? fadeOnly : listItem}
					>
						{actionable ? (
							<button
								className="flex min-h-tap w-full items-center gap-2.5 px-3 py-2 text-left transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.99]"
								onClick={() => onFix(blocker)}
								type="button"
							>
								{body}
							</button>
						) : (
							<span className="flex min-h-tap w-full items-center gap-2.5 px-3 py-2">
								{body}
							</span>
						)}
					</motion.div>
				);
			})}
		</motion.div>
	);
}
