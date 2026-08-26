import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * The floating control the map puts over itself.
 *
 * One touch floor, one glyph, a translucent surface and a blurred backdrop, so
 * a rail of them sits on a basemap without becoming a panel. Coloured only
 * while active — a rail at rest is quiet, and the one control that is holding
 * something is the only yellow thing on the map.
 *
 * `aria-label` is required, not optional: this is the single place in the kit
 * where a glyph appears without a label beside it, and it gets away with that
 * only because it is one of five controls a player learns once.
 */

interface IconButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	"aria-label": string;
	children: ReactNode;
	/** Stays lit while the tool it opens is the one in hand. */
	pressed?: boolean;
	/**
	 * A single character over the corner: the locate control wears `?` until
	 * there is a fix. It shakes every few seconds so it is noticed once.
	 */
	badge?: ReactNode;
	testId?: string;
}

export function IconButton({
	children,
	pressed,
	badge,
	testId,
	className,
	...rest
}: IconButtonProps) {
	const button = (
		<button
			aria-pressed={pressed}
			className={cn(
				"grid size-tap shrink-0 place-items-center rounded-[14px] border-[1.5px] border-transparent",
				"bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] text-ink backdrop-blur-[6px]",
				"shadow-[0_2px_8px_-4px_rgb(0_0_0/0.4)]",
				"transition-[scale,background-color,border-color] duration-[--dur-tap] ease-[--ease-pop]",
				"active:scale-90 active:duration-[--dur-press]",
				"disabled:pointer-events-none disabled:opacity-45",
				pressed && "border-action bg-action font-bold text-action-ink",
				className,
			)}
			data-testid={testId}
			type="button"
			{...rest}
		>
			{children}
		</button>
	);

	if (!badge) return button;

	return (
		<span className="relative inline-flex leading-none">
			{button}
			<span
				aria-hidden
				className={cn(
					"zl-jiggle absolute -top-1.5 -right-1.5 grid size-[19px] place-items-center rounded-full",
					"bg-action font-bold font-mono text-[0.62rem] text-action-ink leading-none",
					// A ring in the ground colour, so the badge reads as sitting on
					// top of the control rather than as part of its outline.
					"shadow-[0_0_0_2px_var(--ground)]",
				)}
			>
				{badge}
			</span>
		</span>
	);
}
