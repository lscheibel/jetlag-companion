import { fadeOnly, mapCardArrive } from "@zero-lag/ui/lib/motion";
import type { HTMLMotionProps } from "motion/react";

/**
 * Props for a `motion.div` that is a direct child of `AnimatePresence`.
 * Docked to the bottom of the overlay so enter/leave overlap in place instead
 * of stacking in the column and jumping.
 */
export function mapCardMotionProps(
	reduced: boolean | null,
): Pick<
	HTMLMotionProps<"div">,
	"animate" | "className" | "exit" | "initial" | "variants"
> {
	return {
		animate: "shown",
		className: "absolute inset-x-0 bottom-0 w-full",
		exit: "leaving",
		initial: "hidden",
		variants: reduced ? fadeOnly : mapCardArrive,
	};
}
