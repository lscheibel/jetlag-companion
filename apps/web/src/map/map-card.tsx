import { fadeOnly, mapCardArrive } from "@zero-lag/ui/lib/motion";
import type { HTMLMotionProps } from "motion/react";

/**
 * Props for a `motion.div` that is a direct child of `AnimatePresence`.
 * A wrapper component drops the presence props, so the card would stay at
 * `hidden` — opacity 0, shifted down — and never arrive.
 */
export function mapCardMotionProps(
	reduced: boolean | null,
): Pick<
	HTMLMotionProps<"div">,
	"animate" | "className" | "exit" | "initial" | "variants"
> {
	return {
		animate: "shown",
		className: "w-full",
		exit: "leaving",
		initial: "hidden",
		variants: reduced ? fadeOnly : mapCardArrive,
	};
}
