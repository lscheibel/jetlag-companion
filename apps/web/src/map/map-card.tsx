import { fadeOnly, mapCardArrive } from "@zero-lag/ui/lib/motion";
import type { HTMLMotionProps } from "motion/react";

/**
 * Props for a `motion.div` that is a direct child of `AnimatePresence`.
 * Docked to the bottom of the overlay so enter/leave overlap in place instead
 * of stacking in the column and jumping.
 *
 * It spans the overlay and lays its card out at the bottom, rather than being
 * an auto-height box pinned to `bottom-0`. A percentage max-height only
 * resolves against a containing block that has a height of its own: pinned by
 * `bottom` alone, the dock was as tall as its content, `max-h` computed to
 * `none`, and a card that asked to stop at a third of the screen grew past the
 * top of it with its scroller never reaching a floor.
 */
export function mapCardMotionProps(
	reduced: boolean | null,
): Pick<
	HTMLMotionProps<"div">,
	"animate" | "className" | "exit" | "initial" | "variants"
> {
	return {
		animate: "shown",
		className: "absolute inset-0 flex w-full flex-col justify-end",
		exit: "leaving",
		initial: "hidden",
		variants: reduced ? fadeOnly : mapCardArrive,
	};
}
