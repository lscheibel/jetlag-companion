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
	| "live"
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

interface Tone {
	/** Applied to the container: the colour of the edge under the face. */
	edge: string;
	/** Applied to the face: what the button is actually painted in. */
	face: string;
	/** What the face does under a thumb. */
	press: string;
	/** What the whole control does under a cursor. */
	lift: string;
}

/**
 * Every tone stands on its own darker edge rather than on translucent black:
 * over a dark ground a black shadow is invisible, and a flat red button next to
 * a raised yellow one reads as disabled rather than as dangerous.
 *
 * Hover lifts the whole control; the press moves only the face, down onto the
 * edge. Both are transforms, so the two never fight each other, and the drop is
 * 3px into a 5px edge — the bottom stays put and the lift never vanishes, which
 * is what made the old 5px→1px collapse read as a glitch.
 */
const TONES: Record<ActionButtonTone, Tone> = {
	primary: {
		edge: "[--press-edge:var(--action-press)]",
		face: "bg-action text-action-ink",
		press: "group-active:translate-y-[3px]",
		lift: "hover:-translate-y-0.5",
	},
	secondary: {
		edge: "[--press-edge:var(--hairline-strong)]",
		face: "border-2 border-hairline-strong bg-surface text-ink",
		press: "group-active:translate-y-[3px]",
		lift: "hover:-translate-y-0.5",
	},
	danger: {
		edge: "[--press-edge:var(--edge-danger)]",
		face: "bg-danger text-white",
		press: "group-active:translate-y-[3px]",
		lift: "hover:-translate-y-0.5",
	},
	curse: {
		edge: "[--press-edge:var(--edge-curse)]",
		face: "bg-curse text-white",
		press: "group-active:translate-y-[3px]",
		lift: "hover:-translate-y-0.5",
	},
	live: {
		edge: "[--press-edge:var(--edge-live)]",
		face: "bg-live text-white",
		press: "group-active:translate-y-[3px]",
		lift: "hover:-translate-y-0.5",
	},
	/*
	 * The quiet tone has nothing under it to compress, so it neither lifts nor
	 * drops — a drop would be a drop into nothing. It shrinks instead.
	 */
	quiet: {
		edge: "[--press-depth:0px]",
		face: "bg-surface-raised text-ink hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--surface-raised))]",
		press: "group-active:scale-95",
		lift: "",
	},
};

/** The radius is on the container; the face inherits it. */
const RADII: Record<ActionButtonSize, string> = {
	primary: "rounded-[20px]",
	comfortable: "rounded-control",
	compact: "rounded-control",
};

const FACES: Record<ActionButtonSize, string> = {
	primary: "min-h-tap-primary px-5 text-lg",
	comfortable: "min-h-tap-comfortable px-4 text-base",
	compact: "min-h-tap px-4 text-sm",
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
	const styles = TONES[tone];

	return (
		<button
			className={cn(
				"zl-press group",
				"disabled:pointer-events-none disabled:opacity-45",
				inline ? "w-auto" : "w-full",
				RADII[size],
				styles.edge,
				styles.lift,
				className,
			)}
			type="button"
			{...rest}
		>
			<span
				className={cn(
					"zl-press-face flex-col",
					"font-display font-extrabold tracking-tight",
					styles.face,
					styles.press,
					FACES[size],
					hint ? "gap-0.5 py-3" : "gap-2",
					beacon && !rest.disabled && "zl-sheen",
				)}
			>
				<span>{children}</span>
				{hint && (
					<span className="font-medium font-mono text-[0.6rem] uppercase leading-none tracking-[0.1em] opacity-70">
						{hint}
					</span>
				)}
			</span>
		</button>
	);
}
