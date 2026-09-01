import type { LngLat } from "@zero-lag/geo";
import {
	type BoardSize,
	type QuestionFamily,
	type QuestionOption,
	readSentence,
	sentenceText,
} from "@zero-lag/rules";
import { formatCoordinates } from "../map/toolkit";

export interface QuestionTextInput {
	readonly family: QuestionFamily;
	readonly option: QuestionOption;
	readonly size: BoardSize;
	/** Where the question is asked from. Half the families mean nothing without it. */
	readonly point: LngLat | null;
	/** What a filled-in option reads as, where this is one. */
	readonly typed?: string;
}

/**
 * The question as a message somebody sends.
 *
 * Two lines, because this is pasted into WhatsApp and read on a lock screen:
 * the sentence, and the point it is asked from. The clock, the price and the
 * rules stay on the card — they are the rulebook both teams already have, and
 * a wall of them in the chat buries the question they are about.
 */
export function questionText({
	family,
	option,
	size,
	point,
	typed,
}: QuestionTextInput): string {
	const sentence = sentenceText(readSentence(family, option, size, typed));
	return point
		? `${sentence}\nAsking from ${formatCoordinates(point)}`
		: sentence;
}
