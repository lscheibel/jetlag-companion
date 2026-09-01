import type { ReadPart } from "@zero-lag/rules";
import { cn } from "@zero-lag/ui/lib/utils";

interface QuestionSentenceProps {
	readonly parts: readonly ReadPart[];
	readonly className?: string;
	readonly testId?: string;
}

/**
 * The question, written out, with the holes in it drawn as holes.
 *
 * The underline is a background gradient rather than a border, and the parts
 * are inline rather than inline-block, so a blank that wraps across two lines
 * keeps its rule on both halves. A `border-bottom` on an inline-block cannot
 * do that — it draws one line under a box that has stopped being one box.
 */
export function QuestionSentence({
	parts,
	className,
	testId,
}: QuestionSentenceProps) {
	return (
		<p
			className={cn(
				"font-display font-extrabold text-[1.2rem] leading-tight tracking-tight",
				className,
			)}
			data-testid={testId}
		>
			{parts.map((part, index) => {
				const key = `${part.kind}-${index}`;
				if (part.kind === "text") return <span key={key}>{part.text}</span>;
				return (
					<span
						className={cn(BLANK, part.kind === "blank" && "px-[1.6em]")}
						key={key}
					>
						{part.kind === "blank" ? (
							" "
						) : (
							<span
								className={cn("", part.picked ? "text-ink" : "text-ink-dim")}
							>
								{part.text}
							</span>
						)}
					</span>
				);
			})}
		</p>
	);
}

const BLANK = [
	"bg-[linear-gradient(var(--action),var(--action))] bg-[length:100%_3px]",
	"bg-[position:0_calc(100%-1px)] bg-no-repeat",
	"px-[0.12em] pb-[3px] [box-decoration-break:clone]",
].join(" ");
