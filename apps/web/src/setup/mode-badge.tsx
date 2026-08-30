import type { ModeId } from "@zero-lag/catalog";
import { cn } from "@zero-lag/ui/lib/utils";
import { modeLabel } from "./modes";

interface ModeBadgeProps {
	readonly modeId: ModeId;
	readonly className?: string;
}

/**
 * The letter a mode wears on the signage: U, S, T, B. Coloured where the city
 * colours it, neutral where it does not — see `MODE_LABELS`.
 */
export function ModeBadge({ modeId, className }: ModeBadgeProps) {
	const label = modeLabel(modeId);
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-8 shrink-0 place-items-center rounded-[9px] font-bold text-sm",
				label.color ? "text-white" : "bg-hairline-strong text-ink",
				className,
			)}
			style={label.color ? { background: label.color } : undefined}
		>
			{label.badge}
		</span>
	);
}
