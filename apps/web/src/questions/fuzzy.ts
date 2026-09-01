/**
 * Matching a typed fragment against a question, forgivingly.
 *
 * A seeker searching this list is standing on a platform with one thumb, so a
 * substring match is not enough: "hosptal", "movie theater" against "cinema",
 * and "5km" against "5 km" all have to land. Four ways to match a word, from
 * best to worst, and the worst one that hits sets the score:
 *
 * 0. the word starts with the term
 * 1. the word contains it
 * 2. one edit away — a typo, a doubled letter, a missing one
 * 3. the term's letters appear in order — an abbreviation, "hsptl"
 *
 * Every whitespace-separated term the player typed has to match something.
 * Ranking is the sum, so a page of exact prefixes sorts above a page of
 * guesses rather than being mixed into it.
 */

const NOT_WORD = /[^a-z0-9]+/g;
/**
 * The seam inside "15km". A run of digits against a run of letters is two
 * words that happen to have been typed without the space — and without this,
 * "15km" matches nothing while "15 km" matches nine questions, which is the
 * kind of difference nobody can see in a search box.
 */
const DIGIT_LETTER_SEAM = /(\d)(\p{L})|(\p{L})(\d)/gu;

/**
 * Lower case, accents dropped, punctuation and digit/letter seams turned into
 * gaps.
 */
export function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(DIGIT_LETTER_SEAM, "$1$3 $2$4")
		.replace(NOT_WORD, " ")
		.trim();
}

export interface Haystack {
	/**
	 * What the question is called: the sentence, the subject, the family. Typos
	 * and abbreviations are forgiven here.
	 */
	readonly name: string;
	/**
	 * The rulebook prose behind it. Matched from the start of a word and
	 * nothing more — a typo-tolerant pass over a paragraph turns "zoo" into
	 * every rule that says "no zoom" and buries the actual zoo questions.
	 */
	readonly prose: string;
}

/**
 * How badly a haystack has to be stretched to contain the query, or `null`
 * where it cannot be. Lower is better; 0 is a clean prefix hit.
 */
export function fuzzyScore(haystack: Haystack, query: string): number | null {
	const terms = normalize(query).split(" ").filter(Boolean);
	if (terms.length === 0) return 0;

	const name = normalize(haystack.name);
	const words = name.split(" ").filter(Boolean);
	const proseWords = normalize(haystack.prose).split(" ").filter(Boolean);

	let total = 0;
	for (const term of terms) {
		const score = termScore(name, words, proseWords, term);
		if (score === null) return null;
		total += score;
	}
	return total;
}

function termScore(
	name: string,
	words: readonly string[],
	proseWords: readonly string[],
	term: string,
): number | null {
	// Across the whole line first, so "5 km" matches a sentence that spells it
	// with the space the player typed.
	if (name.startsWith(term)) return 0;
	if (words.some((word) => word.startsWith(term))) return 0;
	if (name.includes(term)) return 1;
	if (words.some((word) => withinOneEdit(word, term))) return 2;
	if (words.some((word) => isSubsequence(term, word))) return 3;
	// Last: the rule text, at a word boundary. "street view" and "enclave" are
	// each a rule and nothing else, and this is the only way to reach them —
	// but matching mid-word here puts every "no zoom" rule under "zoo".
	if (proseWords.some((word) => word.startsWith(term))) return 4;
	return null;
}

/**
 * One insertion, deletion or substitution apart. Not a full edit distance:
 * a search box wants "is this the word they meant", and two edits away from a
 * six-letter word is a different word.
 */
function withinOneEdit(word: string, term: string): boolean {
	if (Math.abs(word.length - term.length) > 1) return false;
	if (word === term) return true;

	const [shorter, longer] =
		word.length < term.length ? [word, term] : [term, word];

	let shortIndex = 0;
	let longIndex = 0;
	let slack = 1;
	while (shortIndex < shorter.length && longIndex < longer.length) {
		if (shorter[shortIndex] === longer[longIndex]) {
			shortIndex += 1;
			longIndex += 1;
			continue;
		}
		if (slack === 0) return false;
		slack -= 1;
		// Same length means a substitution: step both. Otherwise the extra
		// character is in the longer word, so step only that one.
		if (shorter.length === longer.length) shortIndex += 1;
		longIndex += 1;
	}
	return true;
}

/** Every letter of `term`, in order, somewhere in `word`. */
function isSubsequence(term: string, word: string): boolean {
	// A single letter matching by subsequence is every word in the list.
	if (term.length < 3) return false;
	let index = 0;
	for (const letter of word) {
		if (letter === term[index]) index += 1;
		if (index === term.length) return true;
	}
	return false;
}
