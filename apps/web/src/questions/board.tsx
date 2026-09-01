import {
	type BoardSize,
	familyOptions,
	isOnBoard,
	type QuestionFamily,
	type QuestionOption,
	readSentence,
	sizeNote,
} from "@zero-lag/rules";
import { Field } from "@zero-lag/ui/components/field";
import { Icon } from "@zero-lag/ui/components/icon";
import { cn } from "@zero-lag/ui/lib/utils";
import { FAMILY_LOOK } from "./family-look";
import { GroupHeading, LiftedRow, LiftedSection } from "./parts";
import { QuestionSentence } from "./sentence";

interface QuestionBoardProps {
	readonly family: QuestionFamily;
	readonly size: BoardSize;
	readonly pickedId: string | null;
	/** Raw text for an option the seeker fills in, exactly as they typed it. */
	readonly custom: string;
	readonly onCustom: (value: string) => void;
	/** What that text reads as once it parses. Undefined while it does not. */
	readonly customText: string | undefined;
	readonly onPick: (option: QuestionOption) => void;
	/** A lifted row skips the board and opens its card directly. */
	readonly onOpen: (option: QuestionOption) => void;
}

/**
 * One family's board: the sentence, and the blank's options as the screen.
 *
 * Everything the board's size does not carry is lifted into its own section at
 * the foot rather than greyed out where it lies. Interleaved and dimmed, half
 * a family in the wrong radius reads as a bug; under a dashed rule with a line
 * saying which board it belongs to, it reads as what it is.
 */
export function QuestionBoard({
	family,
	size,
	pickedId,
	custom,
	onCustom,
	customText,
	onPick,
	onOpen,
}: QuestionBoardProps) {
	const look = FAMILY_LOOK[family.id];
	const picked =
		familyOptions(family).find((option) => option.id === pickedId) ?? null;
	/**
	 * One section per reason, not one section with a mixed heading. A small
	 * board lifts photo's medium subjects and its large ones both, and those are
	 * two different statements about where a question lives.
	 */
	const lifted = groupByNote(
		familyOptions(family).filter((option) => !isOnBoard(option, size)),
		size,
	);

	return (
		<>
			<QuestionSentence
				parts={readSentence(family, picked, size, customText)}
				testId="board-sentence"
			/>
			{/*
			 * What comes back, and nothing else. The clock and the price are on the
			 * card, where a seeker reads them once they have a question in mind —
			 * over a board they are two numbers that do not change while you pick.
			 */}
			<p className="eyebrow" data-testid="board-terms">
				{family.answer}
			</p>

			{family.note && (
				<p className="flex items-start gap-2 text-[0.78rem] text-ink-faint leading-snug">
					<Icon className="mt-px shrink-0" name="info" size="sm" />
					<span>{family.note}</span>
				</p>
			)}

			{family.groups.map((group, index) => {
				const options = group.options.filter((option) =>
					isOnBoard(option, size),
				);
				if (options.length === 0) return null;
				return (
					<div
						className="flex flex-col gap-2"
						key={group.title ?? `group-${index}`}
					>
						{group.title && <GroupHeading>{group.title}</GroupHeading>}
						<div className={cn("grid gap-2", COLUMNS[look.columns])}>
							{options.map((option) => (
								<OptionButton
									columns={look.columns}
									key={option.id}
									onPick={() => onPick(option)}
									option={option}
									selected={option.id === pickedId}
									shape={look.shape}
								/>
							))}
						</div>
					</div>
				);
			})}

			{/*
			 * The one option in the rulebook that is typed rather than picked. It
			 * appears under the rungs the moment that chip is chosen, and before
			 * the button — a distance the seeker has not yet named is not a
			 * question anybody can ask.
			 */}
			{picked?.custom === "distanceMeters" && (
				<Field
					className="[&_input]:font-mono [&_input]:tabular-nums"
					data-testid="custom-distance"
					inputMode="numeric"
					label="How far, in metres"
					onChange={(event) => onCustom(event.target.value)}
					placeholder="750"
					problem={
						custom.trim() !== "" && customText === undefined
							? "A number of metres — 750, or 2 km."
							: undefined
					}
					trailing={<span className="eyebrow">m</span>}
					value={custom}
				/>
			)}

			{lifted.map(([note, options]) => (
				<LiftedSection
					heading="Not on this board"
					key={note}
					note={note}
					testId="board-lifted"
				>
					{options.map((option) => (
						<LiftedRow
							key={option.id}
							label={option.label}
							onOpen={() => onOpen(option)}
							testId={`lifted-${option.id}`}
							why={option.tagline}
						/>
					))}
				</LiftedSection>
			))}
		</>
	);
}

/** Lifted options under the line that explains them, in the order given. */
function groupByNote(
	options: readonly QuestionOption[],
	size: BoardSize,
): readonly (readonly [string, readonly QuestionOption[]])[] {
	const sections = new Map<string, QuestionOption[]>();
	for (const option of options) {
		const note = sizeNote(option, size) ?? "Not in this game";
		const existing = sections.get(note);
		if (existing) existing.push(option);
		else sections.set(note, [option]);
	}
	return [...sections];
}

const COLUMNS: Readonly<Record<1 | 2 | 3, string>> = {
	1: "grid-cols-1",
	2: "grid-cols-2",
	3: "grid-cols-3",
};

/**
 * Past this, a label sharing its row wraps to three lines and the grid goes
 * ragged. Such an option takes the whole row instead — radar's free distance
 * and photo's longer subjects are the cases.
 */
const WIDE_LABEL = 17;

const SPAN: Readonly<Record<1 | 2 | 3, string>> = {
	1: "",
	2: "col-span-2",
	3: "col-span-3",
};

function OptionButton({
	option,
	selected,
	shape,
	columns,
	onPick,
}: {
	readonly option: QuestionOption;
	readonly selected: boolean;
	readonly shape: "value" | "subject";
	readonly columns: 1 | 2 | 3;
	readonly onPick: () => void;
}) {
	return (
		<button
			aria-pressed={selected}
			className={cn(
				"flex min-h-tap flex-col justify-center rounded-control border-[1.5px] px-3 py-2",
				"transition-[background-color,border-color,scale] duration-[--dur-tap] ease-[--ease-pop]",
				"active:scale-[0.96] active:duration-[--dur-press]",
				shape === "value"
					? "items-center font-bold font-mono text-[0.82rem]"
					: "items-start text-left font-semibold text-[0.82rem] leading-tight",
				selected
					? "border-action bg-[color-mix(in_oklab,var(--action)_14%,var(--surface))] text-ink"
					: "border-hairline bg-surface text-ink",
				option.label.length > WIDE_LABEL && SPAN[columns],
			)}
			data-testid={`option-${option.id}`}
			onClick={onPick}
			type="button"
		>
			<span>{option.label}</span>
			{option.tagline && (
				<span className="mt-0.5 font-normal text-[0.68rem] text-ink-faint leading-tight">
					{option.tagline}
				</span>
			)}
		</button>
	);
}
