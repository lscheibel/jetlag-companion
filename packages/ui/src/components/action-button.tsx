import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * The control a screen is built around.
 *
 * Sized from the touch tokens rather than from a scale of t-shirt sizes,
 * because the constraint being encoded is a thumb on a moving train and not a
 * visual rhythm. `primary` is 60px and full width by default: one per screen,
 * in the bottom third, where a hand already is.
 *
 * The press is CSS rather than Motion on purpose. A button has to answer under
 * the finger on the frame it is touched, and a spring that settles is a spring
 * that arrives after the player has already looked away. Motion earns its keep
 * on sheets and lists, where there is an exit to animate.
 */

export type ActionButtonTone =
	| "primary"
	| "secondary"
	| "danger"
	| "curse"
	| "quiet";

export type ActionButtonSize = "primary" | "comfortable" | "compact";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	tone?: ActionButtonTone;
	size?: ActionButtonSize;
	/** Second line, smaller: what this action will cost or affect. */
	hint?: ReactNode;
	/** Shrink to content instead of filling the width. */
	inline?: boolean;
	/**
	 * A slow highlight crossing the button every few seconds, to make the one
	 * action that matters findable in peripheral vision. One per screen, at most.
	 */
	beacon?: boolean;
}

const TONES: Record<ActionButtonTone, string> = {
	primary:
		"bg-action text-action-ink shadow-[0_5px_0_var(--action-press)] hover:shadow-[0_7px_0_var(--action-press)] active:shadow-[0_1px_0_var(--action-press)]",
	secondary:
		"bg-transparent text-ink border-2 border-hairline-strong shadow-[0_5px_0_var(--surface-raised)] hover:shadow-[0_7px_0_var(--surface-raised)] active:shadow-[0_1px_0_var(--surface-raised)]",
	danger:
		"bg-danger text-white shadow-[0_5px_0_rgb(0_0_0/0.35)] hover:shadow-[0_7px_0_rgb(0_0_0/0.35)] active:shadow-[0_1px_0_rgb(0_0_0/0.35)]",
	curse:
		"bg-curse text-white shadow-[0_5px_0_rgb(0_0_0/0.35)] hover:shadow-[0_7px_0_rgb(0_0_0/0.35)] active:shadow-[0_1px_0_rgb(0_0_0/0.35)]",
	quiet: "bg-surface-raised text-ink",
};

const SIZES: Record<ActionButtonSize, string> = {
	primary: "min-h-tap-primary rounded-[20px] text-lg px-5",
	comfortable: "min-h-tap-comfortable rounded-control text-base px-4",
	compact: "min-h-tap rounded-control text-sm px-4",
};

export function ActionButton({
	tone = "primary",
	size = "primary",
	hint,
	inline = false,
	beacon = false,
	className,
	children,
	...rest
}: ActionButtonProps) {
	return (
		<button
			className={cn(
				"relative flex items-center justify-center gap-2 overflow-hidden",
				"font-display font-extrabold tracking-tight",
				"transition-[transform,box-shadow] duration-[--dur-press] ease-[--ease-pop]",
				"hover:-translate-y-0.5 active:translate-y-1",
				"disabled:pointer-events-none disabled:opacity-45",
				inline ? "w-auto" : "w-full",
				TONES[tone],
				SIZES[size],
				beacon && "zl-sheen",
				className,
			)}
			type="button"
			{...rest}
		>
			<span>{children}</span>
			{hint && <span className="eyebrow opacity-70">{hint}</span>}
		</button>
	);
}
