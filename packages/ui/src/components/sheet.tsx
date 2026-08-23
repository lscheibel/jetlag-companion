import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { fadeOnly, riseFromBottom, scrimFade } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * A panel that rises from the bottom edge over whatever it interrupts.
 *
 * It covers part of the screen and never all of it: what is behind stays
 * visible so an edit reads as an edit rather than as a new place. This is the
 * one component where Motion is doing something CSS cannot — animating the
 * exit, so a dismissed sheet leaves rather than vanishing.
 *
 * Sheets are a step like any other, so a sheet with a `title` gets the same
 * back affordance a screen would.
 */

interface SheetProps {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	eyebrow?: ReactNode;
	/** Shown at the bottom of the sheet, pinned: the sheet's primary action. */
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	/** Test id for the panel itself; the scrim gets `${testId}-scrim`. */
	testId?: string;
}

export function Sheet({
	open,
	onClose,
	title,
	eyebrow,
	actions,
	children,
	className,
	testId = "sheet",
}: SheetProps) {
	const reduced = useReducedMotion();

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const panelVariants = reduced ? fadeOnly : riseFromBottom;

	return (
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50 flex flex-col justify-end">
					<motion.button
						animate="shown"
						aria-label="Close"
						className="absolute inset-0 bg-scrim"
						data-testid={`${testId}-scrim`}
						exit="leaving"
						initial="hidden"
						onClick={onClose}
						type="button"
						variants={scrimFade}
					/>
					<motion.div
						animate="shown"
						className={cn(
							"relative flex max-h-[86dvh] flex-col gap-3 rounded-t-sheet border-hairline border-t bg-surface",
							"px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-20px_rgb(0_0_0/0.6)]",
							className,
						)}
						data-testid={testId}
						exit="leaving"
						initial="hidden"
						variants={panelVariants}
					>
						<div
							aria-hidden
							className="mx-auto h-1.5 w-11 shrink-0 rounded-full bg-surface-raised"
						/>
						{title && (
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									{eyebrow && <div className="eyebrow truncate">{eyebrow}</div>}
									<h2 className="truncate text-lg">{title}</h2>
								</div>
								<button
									aria-label="Close"
									className="-mr-1 flex size-tap shrink-0 items-center justify-center rounded-control text-ink-dim transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90"
									data-testid={`${testId}-close`}
									onClick={onClose}
									type="button"
								>
									<svg
										aria-hidden="true"
										fill="none"
										height="20"
										stroke="currentColor"
										strokeLinecap="round"
										strokeWidth="2.5"
										viewBox="0 0 24 24"
										width="20"
									>
										<title>Close</title>
										<path d="M6 6l12 12M18 6L6 18" />
									</svg>
								</button>
							</div>
						)}
						<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
							{children}
						</div>
						{actions && <div className="flex flex-col gap-2">{actions}</div>}
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
