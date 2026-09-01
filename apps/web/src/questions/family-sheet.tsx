import {
	type BoardSize,
	isOnBoard,
	QUESTION_FAMILIES,
	type QuestionFamily,
	type QuestionFamilyId,
	questionCount,
	sizeNote,
} from "@zero-lag/rules";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { cn } from "@zero-lag/ui/lib/utils";
import { FAMILY_LOOK } from "./family-look";
import { LiftedRow, LiftedSection } from "./parts";

interface FamilySheetProps {
	readonly open: boolean;
	readonly size: BoardSize;
	readonly currentId: QuestionFamilyId;
	readonly onClose: () => void;
	readonly onPick: (id: QuestionFamilyId) => void;
	readonly onSearch: () => void;
}

/**
 * All six families, on demand.
 *
 * Switching family is rare and picking a blank is constant, so the board keeps
 * the screen and the switch keeps a word in the app bar. This sheet is also
 * the only place a family that is not in this game can explain itself in a
 * sentence rather than as a struck-through icon.
 */
export function FamilySheet({
	open,
	size,
	currentId,
	onClose,
	onPick,
	onSearch,
}: FamilySheetProps) {
	const here = QUESTION_FAMILIES.filter((family) => isOnBoard(family, size));
	const elsewhere = QUESTION_FAMILIES.filter(
		(family) => !isOnBoard(family, size),
	);

	return (
		<Sheet
			actions={
				<ActionButton
					data-testid="open-question-search"
					onClick={onSearch}
					size="comfortable"
					tone="secondary"
				>
					Search all {questionCount(size)} questions
				</ActionButton>
			}
			onClose={onClose}
			open={open}
			testId="family-sheet"
			title="Which kind of question"
		>
			{here.map((family) => (
				<FamilyRow
					current={family.id === currentId}
					family={family}
					key={family.id}
					onPick={() => onPick(family.id)}
				/>
			))}
			{elsewhere.map((family) => (
				<LiftedSection
					heading="Not in this game"
					key={family.id}
					note={sizeNote(family, size) ?? ""}
					testId="family-lifted"
				>
					<LiftedRow
						label={family.name}
						onOpen={() => onPick(family.id)}
						testId={`family-lifted-${family.id}`}
						why={family.shorthand}
					/>
				</LiftedSection>
			))}
		</Sheet>
	);
}

function FamilyRow({
	family,
	current,
	onPick,
}: {
	readonly family: QuestionFamily;
	readonly current: boolean;
	readonly onPick: () => void;
}) {
	return (
		<button
			aria-current={current ? "true" : undefined}
			className={cn(
				"flex min-h-tap-comfortable w-full items-center gap-3 rounded-control border-[1.5px] px-3 py-2 text-left",
				"transition-[background-color,border-color,scale] duration-[--dur-tap] ease-[--ease-pop]",
				"active:scale-[0.985] active:duration-[--dur-press]",
				current
					? "border-action bg-[color-mix(in_oklab,var(--action)_12%,var(--surface))]"
					: "border-transparent bg-surface hover:border-hairline",
			)}
			data-testid={`family-${family.id}`}
			onClick={onPick}
			type="button"
		>
			<span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised">
				<Icon name={FAMILY_LOOK[family.id].icon} size="md" />
			</span>
			<span className="min-w-0 flex-1">
				<b className="block text-[0.9rem] leading-tight">{family.name}</b>
				<span className="mt-0.5 block truncate text-[0.75rem] text-ink-faint leading-tight">
					{family.shorthand}
				</span>
			</span>
		</button>
	);
}
