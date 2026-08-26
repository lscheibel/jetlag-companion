import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/utils";

/**
 * One decision, as a set of targets big enough to hit without looking.
 *
 * Setup screens ask for one thing at a time — game size, hiding radius, which
 * modes of transit count — and each of those is a small set of known options
 * with a sensible default already selected. A tile someone can hit with a
 * thumb beats a select whose options open under the keyboard.
 *
 * Built on real radio inputs so arrow keys, form semantics and screen readers
 * work without reimplementation.
 */

export interface ChoiceOption<T extends string> {
	value: T;
	label: ReactNode;
	/** The consequence of picking it, in the player's terms. */
	hint?: ReactNode;
	icon?: ReactNode;
	disabled?: boolean;
}

interface ChoiceGroupProps<T extends string> {
	label: ReactNode;
	value: T;
	onChange: (value: T) => void;
	options: readonly ChoiceOption<T>[];
	/** Side by side for two or three short options; stacked when they have hints. */
	layout?: "row" | "stack";
	testId?: string;
	className?: string;
}

export function ChoiceGroup<T extends string>({
	label,
	value,
	onChange,
	options,
	layout = "stack",
	testId,
	className,
}: ChoiceGroupProps<T>) {
	const name = useId();

	return (
		<fieldset
			className={cn("flex flex-col gap-2", className)}
			data-testid={testId}
		>
			<legend className="eyebrow mb-1">{label}</legend>
			<div
				className={cn(
					"gap-2",
					layout === "row"
						? "grid auto-cols-fr grid-flow-col"
						: "flex flex-col",
				)}
			>
				{options.map((option) => {
					const selected = option.value === value;
					return (
						<label
							className={cn(
								"flex min-h-tap-comfortable cursor-pointer items-center gap-3",
								"rounded-control border-[1.5px] bg-surface px-3 py-2.5",
								"transition-[border-color,background-color] duration-[--dur-tap]",
								"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
								/*
								 * The same rule the toggle strip follows: no border until it
								 * is chosen, then the action colour. Nothing travels — the
								 * indicator is the only thing that moves.
								 */
								selected
									? "border-action bg-[color-mix(in_oklab,var(--action)_10%,var(--surface))]"
									: "border-transparent hover:border-hairline",
								option.disabled && "pointer-events-none opacity-40",
								layout === "row" && "justify-center text-center",
							)}
							data-testid={testId ? `${testId}-${option.value}` : undefined}
							key={option.value}
						>
							<input
								checked={selected}
								className="sr-only"
								disabled={option.disabled}
								name={name}
								onChange={() => onChange(option.value)}
								type="radio"
								value={option.value}
							/>
							{layout === "stack" && <RadioMark selected={selected} />}
							{option.icon && (
								<span aria-hidden className="text-xl leading-none">
									{option.icon}
								</span>
							)}
							<span className={cn("min-w-0", layout === "stack" && "flex-1")}>
								<span className="block font-semibold text-[0.95rem] leading-tight">
									{option.label}
								</span>
								{option.hint && (
									<span className="mt-0.5 block text-ink-dim text-xs leading-snug">
										{option.hint}
									</span>
								)}
							</span>
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}

/**
 * The dot is the only thing that animates, and it grows rather than fades: at
 * arm's length a fade reads as the control still deciding.
 */
function RadioMark({ selected }: { readonly selected: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-full border-2 bg-surface",
				"transition-colors duration-[--dur-tap]",
				selected ? "border-action" : "border-hairline-strong",
			)}
		>
			<span
				className={cn(
					"size-3.5 rounded-full bg-action",
					"transition-transform duration-[--dur-move] ease-[--ease-pop]",
					selected ? "scale-100" : "scale-0",
				)}
			/>
		</span>
	);
}
