import { cn } from "../lib/utils";

/**
 * Eight swatches, not a colour wheel.
 *
 * This is read on a phone in direct sun by somebody who is about to be
 * identified by it on a map. A free hue is a hue that fails in sunlight, fails
 * for a colour-blind player, or matches the team standing next to you — so the
 * choice is a short curated set, and the same is true of the faces.
 *
 * Taken options are dimmed and struck rather than removed, so the grid never
 * reflows under a thumb that is already moving toward a square.
 */

export interface PickerOption {
	/** The colour or emoji itself. */
	value: string;
	/** Its name, for the screen reader — "Jade", "Fox". */
	label: string;
	/** Who already has it. Says so in the label rather than hiding the square. */
	takenBy?: string | null;
}

interface PickerProps {
	label: string;
	options: readonly PickerOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Each square gets `${testIdPrefix}-${value}`. */
	testIdPrefix?: string;
	className?: string;
}

/**
 * The selected square lifts, pops once and takes a double ring — ground then
 * action — so the selection survives being the same hue as the swatch itself.
 */
const SELECTED_RING =
	"zl-pop -translate-y-0.5 shadow-[0_0_0_3px_var(--ground),0_0_0_6px_var(--action)]";

export function ColorPicker({
	label,
	options,
	value,
	onChange,
	disabled = false,
	testIdPrefix = "color",
	className,
}: PickerProps) {
	return (
		<PickerGrid className={className} label={label}>
			{options.map((option) => {
				const taken = Boolean(option.takenBy) && option.value !== value;
				return (
					<button
						aria-label={
							option.takenBy
								? `${option.label}, taken by ${option.takenBy}`
								: option.label
						}
						aria-pressed={option.value === value}
						className={cn(
							"relative aspect-square rounded-[11px] shadow-[inset_0_0_0_2px_rgb(255_255_255/0.14)]",
							"transition-[translate,box-shadow] duration-[--dur-tap] ease-[--ease-pop]",
							"hover:-translate-y-0.5",
							option.value === value && SELECTED_RING,
							taken && "pointer-events-none opacity-35",
							disabled && "pointer-events-none opacity-45",
						)}
						data-testid={`${testIdPrefix}-${option.value}`}
						disabled={disabled || taken}
						key={option.value}
						onClick={() => onChange(option.value)}
						style={{ background: option.value }}
						type="button"
					>
						{taken && (
							<span
								aria-hidden
								className="absolute inset-0 rounded-[11px] bg-[linear-gradient(135deg,transparent_calc(50%-1.5px),rgb(0_0_0/0.62)_50%,transparent_calc(50%+1.5px))]"
							/>
						)}
					</button>
				);
			})}
		</PickerGrid>
	);
}

export function EmojiPicker({
	label,
	options,
	value,
	onChange,
	disabled = false,
	testIdPrefix = "emoji",
	className,
}: PickerProps) {
	return (
		<PickerGrid className={className} label={label}>
			{options.map((option) => {
				const taken = Boolean(option.takenBy) && option.value !== value;
				return (
					<button
						aria-label={
							option.takenBy
								? `${option.label}, taken by ${option.takenBy}`
								: option.label
						}
						aria-pressed={option.value === value}
						className={cn(
							"grid aspect-square place-items-center rounded-[11px] bg-surface-raised text-xl",
							"transition-[translate,box-shadow] duration-[--dur-tap] ease-[--ease-pop]",
							"hover:-translate-y-0.5",
							option.value === value && SELECTED_RING,
							taken && "pointer-events-none opacity-35",
							disabled && "pointer-events-none opacity-45",
						)}
						data-testid={`${testIdPrefix}-${option.value}`}
						disabled={disabled || taken}
						key={option.value}
						onClick={() => onChange(option.value)}
						type="button"
					>
						<span aria-hidden>{option.value}</span>
					</button>
				);
			})}
		</PickerGrid>
	);
}

function PickerGrid({
	label,
	className,
	children,
}: {
	readonly label: string;
	readonly className?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<fieldset className={cn("flex flex-col gap-2", className)}>
			<legend className="eyebrow mb-1">{label}</legend>
			<div className="grid grid-cols-8 gap-2">{children}</div>
		</fieldset>
	);
}
