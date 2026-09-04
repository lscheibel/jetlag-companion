import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";
import { Drawer } from "vaul";
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
 * True inside an open sheet, so a sheet opened from a sheet knows to stack
 * rather than to start a second, independent drawer.
 *
 * The nesting is not visible from any one call site — `PointField` renders a
 * sheet and appears both on a plain screen and inside the question card — so
 * the component has to work it out from where it finds itself rather than from
 * a prop somebody has to remember to pass.
 */
const InSheet = createContext(false);

/**
 * A panel that rises from the bottom edge over whatever it interrupts.
 *
 * It covers part of the screen and never all of it: what is behind stays
 * visible so an edit reads as an edit rather than as a new place.
 *
 * Vaul drives it, which buys the thing a sheet on a phone is expected to do:
 * a drag down dismisses it, and a drag that starts on scrolled content scrolls
 * that content instead. Neither is an animation the kit could declare, because
 * the transform is the gesture — it has to be written by whoever is reading the
 * pointer. So this is the one panel whose entrance and exit are not ours: Vaul
 * ships them, on a curve near enough to `--ease-travel` not to read as a
 * different app. Reduced motion is still honoured, by the blanket guard at the
 * bottom of `styles/motion.css`.
 *
 * The grabber and the scrim are the dismiss: tapping outside leaves. An X
 * in the header is opt-in, because beside two action buttons it reads as a
 * third one.
 */

interface SheetProps {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	/**
	 * The sheet's name for a screen reader when there is no visible title. A
	 * dialog without a name is announced as "dialog" and nothing else.
	 */
	label?: string;
	eyebrow?: ReactNode;
	/** Shown at the bottom of the sheet, pinned: the sheet's primary action. */
	actions?: ReactNode;
	/**
	 * Between the title and the body, and outside the body's scroll: a field
	 * that filters a list has to stay put while the list moves under it.
	 */
	pinned?: ReactNode;
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
	label,
	eyebrow,
	actions,
	pinned,
	children,
	className,
	testId = "sheet",
	closable = false,
}: SheetProps) {
	const nested = useContext(InSheet);
	const Root = nested ? Drawer.NestedRoot : Drawer.Root;

	return (
		<Root
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			open={open}
		>
			{/*
			 * Everything the caller passed sits under the provider, `pinned` and
			 * `actions` included: a sheet reached from a pinned filter field is
			 * still a sheet opened from inside a sheet.
			 */}
			<InSheet.Provider value={true}>
				<Drawer.Portal>
					<Drawer.Overlay
						className="fixed inset-0 z-50 bg-scrim"
						data-testid={`${testId}-scrim`}
					/>
					{/*
					 * `aria-describedby={undefined}`: the dialog has a name and no one
					 * description — the body is a list, a form or a card, not a
					 * paragraph about the sheet — and without this Radix warns about
					 * the missing description on every open.
					 */}
					<Drawer.Content
						aria-describedby={undefined}
						className={cn(
							"fixed inset-x-0 bottom-0 z-50 flex max-h-[86dvh] flex-col gap-3 outline-none",
							"rounded-t-sheet border-hairline border-t bg-surface",
							"px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]",
							className,
						)}
						data-testid={testId}
					>
						<div
							aria-hidden
							className="mx-auto h-[5px] w-11 shrink-0 rounded-full bg-hairline-strong"
						/>
						{title ? (
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									{eyebrow && <div className="eyebrow truncate">{eyebrow}</div>}
									<Drawer.Title className="truncate text-lg">
										{title}
									</Drawer.Title>
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
						) : (
							<Drawer.Title className="sr-only">
								{label ?? "Sheet"}
							</Drawer.Title>
						)}
						{pinned && <div className="shrink-0">{pinned}</div>}
						{/*
						 * `touch-action: pan-y`: the drawer sets `touch-action: none` on
						 * itself so a drag anywhere on it is the dismiss gesture, and that
						 * would otherwise take the body's own scrolling with it. Vaul reads
						 * the scroll position on pointer-down and stands down when the body
						 * is scrolled, so the two do not fight over the same finger.
						 */}
						<div className="flex min-h-0 flex-1 touch-pan-y flex-col gap-3 overflow-y-auto [&>*]:shrink-0">
							{children}
						</div>
						{actions && (
							<div className="flex shrink-0 flex-col gap-2">{actions}</div>
						)}
					</Drawer.Content>
				</Drawer.Portal>
			</InSheet.Provider>
		</Root>
	);
}
