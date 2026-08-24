import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * The frame every screen is built in: a header that can always go back, a body
 * that scrolls, and an action area pinned where a thumb is.
 *
 * Nearly everything in this app is a step in something longer — creating a
 * game, building an area, casting a curse, answering a question. A step whose
 * only way out is the phone's own gesture is a step people abandon, so `onBack`
 * is part of the frame rather than something each screen remembers to add.
 *
 * The ui package takes a callback rather than reaching for the router: where
 * back goes is the route's business, and half of these steps are inside a sheet
 * with no URL of their own.
 */

interface ScreenProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

export function Screen({ className, children, ...rest }: ScreenProps) {
	return (
		<div
			/**
			 * A fixed-height column, not a growing page: the header, the pinned
			 * action and the tab bar are the frame, and only the body between them
			 * scrolls. Two things stuck to the bottom of a growing page are two
			 * things stuck to the same place, which is how a nav bar ends up on top
			 * of the button it is meant to sit under.
			 */
			className={cn(
				"flex h-dvh flex-col overflow-hidden bg-ground text-ink",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}

interface ScreenHeaderProps {
	title: ReactNode;
	/** Small line above the title: where you are, or who this is from. */
	eyebrow?: ReactNode;
	/** Render a back control. Omit only for the first screen of a flow. */
	onBack?: () => void;
	/** What the back control announces to a screen reader. */
	backLabel?: string;
	/** Status, timer or menu, on the trailing edge. */
	trailing?: ReactNode;
	className?: string;
}

export function ScreenHeader({
	title,
	eyebrow,
	onBack,
	backLabel = "Back",
	trailing,
	className,
}: ScreenHeaderProps) {
	return (
		<header
			className={cn(
				"z-20 flex shrink-0 items-center gap-3 bg-ground/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3",
				className,
			)}
		>
			{onBack && (
				<button
					aria-label={backLabel}
					className={cn(
						"-ml-1 flex size-tap shrink-0 items-center justify-center rounded-control",
						"text-ink transition-transform duration-[--dur-press] ease-[--ease-pop]",
						"hover:bg-surface-raised active:scale-90",
					)}
					data-testid="screen-back"
					onClick={onBack}
					type="button"
				>
					<svg
						aria-hidden="true"
						fill="none"
						height="22"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2.5"
						viewBox="0 0 24 24"
						width="22"
					>
						<title>Back</title>
						<path d="M15 5 8 12l7 7" />
					</svg>
				</button>
			)}
			<div className="min-w-0 flex-1">
				{eyebrow && <div className="eyebrow truncate">{eyebrow}</div>}
				<h1 className="truncate text-xl">{title}</h1>
			</div>
			{trailing}
		</header>
	);
}

interface ScreenBodyProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

export function ScreenBody({ className, children, ...rest }: ScreenBodyProps) {
	return (
		<div
			className={cn(
				"zl-enter flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}

interface ScreenActionsProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	/** A line of context above the action: what happens, or why it is blocked. */
	note?: ReactNode;
}

/**
 * The bottom third. Pinned, padded past the home indicator, and the only place
 * a primary action ever appears.
 */
export function ScreenActions({
	note,
	className,
	children,
	...rest
}: ScreenActionsProps) {
	return (
		<div
			className={cn(
				"z-20 flex shrink-0 flex-col gap-2",
				"bg-gradient-to-t from-ground via-ground to-transparent",
				"px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
				className,
			)}
			{...rest}
		>
			{note && (
				<p className="text-center text-ink-dim text-xs leading-snug">{note}</p>
			)}
			{children}
		</div>
	);
}
