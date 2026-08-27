import { multiPolygonToRegion, regionArea } from "@zero-lag/geo";
import type { AreaPiece } from "@zero-lag/schema";
import { Icon } from "@zero-lag/ui/components/icon";
import { cn } from "@zero-lag/ui/lib/utils";
import { formatArea } from "../../setup/game-size";
import { sourceLabel } from "./labels";

interface PieceRowProps {
	piece: AreaPiece;
	onRemove?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	onToggleOp?: () => void;
	compact?: boolean;
}

export function PieceRow({
	piece,
	onRemove,
	onMoveUp,
	onMoveDown,
	onToggleOp,
	compact = false,
}: PieceRowProps) {
	const minus = piece.op === "subtract";
	const area = formatArea(regionArea(multiPolygonToRegion(piece.geometry)));

	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-[15px] border border-hairline bg-surface py-2 pr-2 pl-2.5",
				minus ? "border-l-4 border-l-danger" : "border-l-4 border-l-live",
			)}
			data-testid={`area-piece-${piece.id}`}
		>
			{onToggleOp ? (
				<button
					aria-label={minus ? "Add this piece instead" : "Take this piece out"}
					className={cn(
						"grid size-6 shrink-0 place-items-center rounded-lg font-bold text-sm",
						minus ? "bg-danger/20 text-danger" : "bg-live/20 text-live",
					)}
					data-testid={`area-piece-op-${piece.id}`}
					onClick={onToggleOp}
					type="button"
				>
					<Icon name={minus ? "minus" : "plus"} size="xs" />
				</button>
			) : (
				<span
					aria-hidden
					className={cn(
						"grid size-6 shrink-0 place-items-center rounded-lg font-bold text-sm",
						minus ? "bg-danger/20 text-danger" : "bg-live/20 text-live",
					)}
				>
					<Icon name={minus ? "minus" : "plus"} size="xs" />
				</span>
			)}
			<div className="min-w-0 flex-1">
				<b className="block truncate text-[0.8rem] leading-tight">
					{piece.name}
				</b>
				<span className="mt-0.5 block font-mono text-[0.55rem] text-ink-faint uppercase tracking-[0.07em]">
					{sourceLabel(piece.source)}
					{compact ? "" : ` · ${area}`}
				</span>
			</div>
			{onMoveUp && (
				<button
					aria-label="Move up"
					className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint"
					onClick={onMoveUp}
					type="button"
				>
					<Icon name="caret-up" size="sm" />
				</button>
			)}
			{onMoveDown && (
				<button
					aria-label="Move down"
					className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint"
					onClick={onMoveDown}
					type="button"
				>
					<Icon name="caret-down" size="sm" />
				</button>
			)}
			{onRemove && (
				<button
					aria-label={`Remove ${piece.name}`}
					className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint"
					data-testid={`area-piece-remove-${piece.id}`}
					onClick={onRemove}
					type="button"
				>
					<Icon name="x" size="sm" />
				</button>
			)}
		</div>
	);
}
