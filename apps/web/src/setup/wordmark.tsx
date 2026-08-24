import { cn } from "@zero-lag/ui/lib/utils";

/**
 * The name, set the way the signage sets a station name: two lines, and the
 * second one on the yellow that means "act" everywhere else in the app.
 */

interface WordmarkProps {
	className?: string;
}

export function Wordmark({ className }: WordmarkProps) {
	return (
		<span
			className={cn(
				"block font-display font-extrabold leading-[0.92] tracking-[-0.035em]",
				className,
			)}
		>
			zero
			<br />
			<span className="rounded-md bg-action px-[0.1em] text-action-ink">
				lag
			</span>
		</span>
	);
}
