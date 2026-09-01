import { Icon } from "@zero-lag/ui/components/icon";
import { cn } from "@zero-lag/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The section under the dashed rule: what belongs to a bigger board.
 *
 * Not a disabled list. Everything in here opens the same question card as
 * everything above it — the separation sorts the menu and states the rule, and
 * whether to ask anyway is the players' call rather than the app's.
 */
export function LiftedSection({
	heading,
	note,
	children,
	testId,
}: {
	readonly heading: string;
	readonly note: string;
	readonly children: ReactNode;
	readonly testId?: string;
}) {
	return (
		<section
			className="mt-1 flex flex-col gap-1.5 rounded-tile border border-hairline-strong border-dashed p-2.5"
			data-testid={testId}
		>
			<div className="flex items-center gap-2">
				<span className="eyebrow shrink-0">{heading}</span>
				<span aria-hidden className="h-px flex-1 bg-hairline" />
				<span className="eyebrow shrink-0 text-ink-faint">{note}</span>
			</div>
			{children}
		</section>
	);
}

/** One row inside a lifted section: inert to look at, alive to touch. */
export function LiftedRow({
	label,
	why,
	onOpen,
	testId,
}: {
	readonly label: string;
	readonly why?: string;
	readonly onOpen: () => void;
	readonly testId?: string;
}) {
	return (
		<button
			className={cn(
				"flex min-h-tap w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left",
				"border border-hairline border-dashed text-ink-dim",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.985]",
			)}
			data-testid={testId}
			onClick={onOpen}
			type="button"
		>
			<Icon className="text-ink-faint" name="resize" size="xs" />
			<span className="min-w-0 flex-1">
				<span className="block font-medium text-[0.82rem] leading-tight">
					{label}
				</span>
				{why && (
					<span className="mt-0.5 block text-[0.7rem] text-ink-faint leading-tight">
						{why}
					</span>
				)}
			</span>
		</button>
	);
}

/** A group heading on a board that scrolls: the group is the unit, not the column. */
export function GroupHeading({ children }: { readonly children: ReactNode }) {
	return (
		<div className="flex items-center gap-2 pt-1.5">
			<span className="eyebrow shrink-0 text-ink-faint">{children}</span>
			<span aria-hidden className="h-px flex-1 bg-hairline" />
		</div>
	);
}
