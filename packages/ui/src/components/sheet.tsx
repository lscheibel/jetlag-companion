import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { fadeOnly, riseFromBottom, scrimFade } from "../lib/motion";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

/**
 * Keep the last value while `active` is false, so a sheet can animate out
 * with the content it had when it was open. Unmounting on close skips exit.
 */
export function useHeldValue<T>(active: boolean, value: T): T {
	const held = useRef(value);
	if (active) held.current = value;
	return active ? value : held.current;
}

/**
 * A panel that rises from the bottom edge over whatever it interrupts.
 *
 * It covers part of the screen and never all of it: what is behind stays
 * visible so an edit reads as an edit rather than as a new place. This is the
 * one component where Motion is doing something CSS cannot — animating the
 * exit, so a dismissed sheet leaves rather than vanishing.
 *
 * The grabber and the scrim are the dismiss: tapping outside leaves. An X
 * in the header is opt-in, because beside two action buttons it reads as a
 * third one.
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
	/**
	 * An X in the header. Off by default: the grabber says it is a sheet and
	 * tapping the scrim dismisses it.
	 */
	closable?: boolean;
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
	closable = false,
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
				<motion.div
					animate="shown"
					className="fixed inset-0 z-50 flex flex-col justify-end"
					exit="leaving"
					initial="hidden"
					key="sheet"
					variants={{
						hidden: {},
						shown: {},
						leaving: { transition: { when: "afterChildren" } },
					}}
				>
					<motion.button
						aria-label="Close"
						className="absolute inset-0 bg-scrim"
						data-testid={`${testId}-scrim`}
						onPointerDown={(event) => {
							event.preventDefault();
							onClose();
						}}
						type="button"
						variants={scrimFade}
					/>
					<motion.div
						className={cn(
							"relative flex max-h-[86dvh] flex-col gap-3 rounded-t-sheet border-hairline border-t bg-surface",
							"px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-20px_rgb(0_0_0/0.6)]",
							className,
						)}
						data-testid={testId}
						variants={panelVariants}
					>
						<div
							aria-hidden
							className="mx-auto h-[5px] w-11 shrink-0 rounded-full bg-hairline-strong"
						/>
						{title && (
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									{eyebrow && <div className="eyebrow truncate">{eyebrow}</div>}
									<h2 className="truncate text-lg">{title}</h2>
								</div>
								{closable && (
									<button
										aria-label="Close"
										className="-mr-1 grid size-tap shrink-0 place-items-center rounded-control text-ink-dim transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90"
										data-testid={`${testId}-close`}
										onClick={onClose}
										type="button"
									>
										<Icon name="x" size="md" />
									</button>
								)}
							</div>
						)}
						<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [&>*]:shrink-0">
							{children}
						</div>
						{actions && (
							<div className="flex shrink-0 flex-col gap-2">{actions}</div>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
