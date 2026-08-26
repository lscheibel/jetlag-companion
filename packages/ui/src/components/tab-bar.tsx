import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A place switcher for the bottom of a screen.
 *
 * A bar rather than a menu because the destinations are used mid-game with one
 * hand on a handrail, and because "where am I" should be answerable without
 * opening anything.
 */

export interface TabItem {
	id: string;
	label: string;
	/** A glyph, never load-bearing on its own — the label is always there. */
	icon: ReactNode;
	/** Something happened here since you last looked. A dot, not a count. */
	alert?: boolean;
}

interface TabBarProps {
	items: readonly TabItem[];
	current: string;
	onSelect: (id: string) => void;
	className?: string;
}

export function TabBar({ items, current, onSelect, className }: TabBarProps) {
	const reduced = useReducedMotion();

	return (
		<nav
			className={cn(
				"z-30 grid shrink-0 auto-cols-fr grid-flow-col gap-0.5",
				"border-hairline border-t bg-ground/95 px-2 pt-1.5 backdrop-blur",
				"pb-[max(0.5rem,env(safe-area-inset-bottom))]",
				className,
			)}
			data-testid="tab-bar"
		>
			{items.map((item) => {
				const active = item.id === current;
				return (
					<button
						aria-current={active ? "page" : undefined}
						className={cn(
							"relative grid min-h-tap place-items-center gap-0.5 rounded-control px-2 py-1.5",
							"transition-colors duration-[--dur-tap]",
							active ? "text-action" : "text-ink-dim",
						)}
						data-testid={`tab-${item.id}`}
						key={item.id}
						onClick={() => onSelect(item.id)}
						type="button"
					>
						{active && (
							<motion.span
								aria-hidden
								className="absolute inset-0 rounded-control bg-[color-mix(in_oklab,var(--action)_12%,transparent)]"
								layoutId="tab-highlight"
								// The highlight travels between tabs — one shared element,
								// not three separate fades — and travels without overshoot.
								transition={
									reduced
										? { duration: 0 }
										: { duration: 0.26, ease: [0.32, 0.72, 0.28, 1] }
								}
							/>
						)}
						<span
							className={cn(
								"relative flex leading-none transition-transform duration-[--dur-tap] ease-[--ease-pop]",
								active && "-translate-y-px scale-110",
							)}
						>
							{item.icon}
						</span>
						<span className="relative font-mono text-[0.56rem] uppercase leading-none tracking-[0.07em]">
							{item.label}
						</span>
						{item.alert && (
							<span
								aria-hidden
								className="absolute top-1.5 right-3 size-[7px] rounded-full bg-offline"
							/>
						)}
					</button>
				);
			})}
		</nav>
	);
}
