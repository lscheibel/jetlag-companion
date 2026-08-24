import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { glide } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * The three places a game has: the lobby, the rules, the map.
 *
 * A bar rather than a menu because all three are used mid-game with one hand on
 * a handrail, and because "where am I" should be answerable without opening
 * anything. Steps in a flow — the setup wizard, the briefing, the ready check —
 * deliberately do not show it: they are one question deep and their way out is
 * the back control, not a change of place.
 */

export interface TabItem {
	id: string;
	label: string;
	/** A glyph, never load-bearing on its own — the label is always there. */
	icon: ReactNode;
	badge?: ReactNode;
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
							"relative grid min-h-tap place-items-center gap-1 rounded-control px-2 py-1.5",
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
								className="absolute inset-0 rounded-control bg-action/10"
								layoutId="tab-highlight"
								transition={reduced ? { duration: 0 } : glide}
							/>
						)}
						<span
							className={cn(
								"relative text-lg leading-none transition-transform duration-[--dur-tap] ease-[--ease-pop]",
								active && "-translate-y-px scale-110",
							)}
						>
							{item.icon}
						</span>
						<span className="relative font-mono text-[0.55rem] uppercase leading-none tracking-[0.08em]">
							{item.label}
						</span>
						{item.badge}
					</button>
				);
			})}
		</nav>
	);
}
