import {
	type BoardSize,
	familyOptions,
	isOnBoard,
	QUESTION_FAMILIES,
	type QuestionFamily,
	type QuestionOption,
	readSentence,
	sentenceText,
	sizeNote,
} from "@zero-lag/rules";
import { Field } from "@zero-lag/ui/components/field";
import { Icon } from "@zero-lag/ui/components/icon";
import { useMemo } from "react";
import { FAMILY_LOOK } from "./family-look";
import { fuzzyScore, type Haystack } from "./fuzzy";
import { LiftedRow, LiftedSection } from "./parts";

interface QuestionSearchProps {
	readonly size: BoardSize;
	readonly query: string;
	readonly onQueryChange: (query: string) => void;
	readonly onOpen: (family: QuestionFamily, option: QuestionOption) => void;
}

interface Entry {
	readonly family: QuestionFamily;
	readonly option: QuestionOption;
	/** The question as one line, which is also most of what search matches on. */
	readonly text: string;
	readonly here: boolean;
	readonly size: BoardSize;
}

/**
 * One field over every question in the game, families crossed.
 *
 * A screen rather than a field on the board, because it answers a different
 * question — "where is the hospital one?" — and reaching across families is
 * the only place that crossing is useful. Picking a result opens the same card
 * the board opens, so search never becomes a second way to ask.
 */
export function QuestionSearch({
	size,
	query,
	onQueryChange,
	onOpen,
}: QuestionSearchProps) {
	const entries = useMemo(() => allEntries(size), [size]);
	const matches = rank(entries, query);
	const families = new Set(matches.map((entry) => entry.family.id)).size;
	const here = matches.filter((entry) => entry.here);
	const elsewhere = matches.filter((entry) => !entry.here);

	return (
		<>
			<Field
				data-testid="question-search"
				label="Search"
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder="hospital, 5 km, photo…"
				type="search"
				value={query}
			/>
			<p className="eyebrow" data-testid="search-count">
				{matches.length} {matches.length === 1 ? "question" : "questions"} ·{" "}
				{families} {families === 1 ? "family" : "families"}
			</p>

			{matches.length === 0 && (
				<p className="text-ink-dim text-sm">
					Nothing matches “{query.trim()}”. Try the kind of place, a distance,
					or the family's name.
				</p>
			)}

			{here.map((entry) => (
				<ResultRow
					entry={entry}
					key={`${entry.family.id}-${entry.option.id}`}
					onOpen={() => onOpen(entry.family, entry.option)}
				/>
			))}

			{elsewhere.length > 0 && (
				<LiftedSection
					heading="Not on this board"
					note={`${elsewhere.length} more`}
					testId="search-lifted"
				>
					{elsewhere.map((entry) => (
						<LiftedRow
							key={`${entry.family.id}-${entry.option.id}`}
							label={entry.text}
							onOpen={() => onOpen(entry.family, entry.option)}
							testId={`search-lifted-${entry.family.id}-${entry.option.id}`}
							why={`${entry.family.name} · ${sizeNote(entry.option, size) ?? sizeNote(entry.family, size) ?? ""}`}
						/>
					))}
				</LiftedSection>
			)}
		</>
	);
}

function ResultRow({
	entry,
	onOpen,
}: {
	readonly entry: Entry;
	readonly onOpen: () => void;
}) {
	return (
		<button
			className="flex min-h-tap-comfortable w-full items-center gap-2.5 rounded-control border border-hairline bg-surface px-2.5 py-2 text-left transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.985]"
			data-testid={`search-result-${entry.family.id}-${entry.option.id}`}
			onClick={onOpen}
			type="button"
		>
			<span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-surface-raised text-ink-dim">
				<Icon name={FAMILY_LOOK[entry.family.id].icon} size="xs" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-[0.82rem] leading-tight">
					{entry.text}
				</span>
				<span className="mt-0.5 block text-[0.68rem] text-ink-faint leading-tight">
					{entry.family.name} · {entry.family.answer.toLowerCase()} ·{" "}
					{entry.family.minutes[entry.size]} min
				</span>
			</span>
		</button>
	);
}

function allEntries(size: BoardSize): readonly Entry[] {
	return QUESTION_FAMILIES.flatMap((family) =>
		familyOptions(family).map((option) => ({
			family,
			option,
			text: sentenceText(readSentence(family, option, size)),
			here: isOnBoard(family, size) && isOnBoard(option, size),
			size,
		})),
	);
}

/**
 * What the typed fragment is matched against.
 *
 * `name` is everything a player would call the question — how it reads, the
 * subject, the family, and the other words for it the rulebook or a different
 * country uses. `prose` is the rule behind it, matched literally.
 */
function haystack(entry: Entry): Haystack {
	return {
		name: [
			entry.text,
			entry.option.label,
			entry.option.tagline ?? "",
			entry.option.aka ?? "",
			entry.family.name,
			entry.family.aka ?? "",
			entry.family.answer,
		].join(" "),
		prose: [entry.option.rule ?? "", ...entry.family.rules].join(" "),
	};
}

/**
 * Matches, best first — and within one score, the order the board lists them
 * in, so a search that matches everything reads as the board and not as a
 * shuffle.
 */
function rank(entries: readonly Entry[], query: string): readonly Entry[] {
	return entries
		.map((entry, index) => ({
			entry,
			index,
			score: fuzzyScore(haystack(entry), query),
		}))
		.filter(
			(scored): scored is { entry: Entry; index: number; score: number } =>
				scored.score !== null,
		)
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.map((scored) => scored.entry);
}
