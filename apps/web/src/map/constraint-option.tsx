import { Icon, type IconName } from "@zero-lag/ui/components/icon";

/** What a constraint started from this pin would cut with. */
export type PoiConstraintKind = "circle" | "nearest";

interface ConstraintOptionProps {
	readonly icon: IconName;
	readonly label: string;
	readonly hint: string;
	readonly testId: string;
	readonly onPick: () => void;
}

/**
 * One shape a pin can become. Shared by the amenity sheet and the station
 * sheet, so a museum and an U-Bahn platform offer the same row rather than two
 * dialects of the same choice.
 */
export function ConstraintOption({
	icon,
	label,
	hint,
	testId,
	onPick,
}: ConstraintOptionProps) {
	return (
		<button
			className="flex w-full items-center gap-3 rounded-control border border-hairline bg-surface px-3 py-2.5 text-left"
			data-testid={testId}
			onClick={onPick}
			type="button"
		>
			<span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised">
				<Icon name={icon} size="md" />
			</span>
			<span className="min-w-0 flex-1">
				<b className="block text-[0.85rem] leading-tight">{label}</b>
				<span className="eyebrow mt-0.5 block text-ink-dim">{hint}</span>
			</span>
		</button>
	);
}
