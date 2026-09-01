import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import {
	type BoardSize,
	boardSizeName,
	isOnBoard,
	type QuestionFamily,
	type QuestionOption,
	readSentence,
	smallestBoardSize,
} from "@zero-lag/rules";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { InlineNotice } from "@zero-lag/ui/components/notice";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { type ReactNode, useState } from "react";
import { PointField } from "../map/point-field";
import { questionText } from "./question-text";
import { QuestionSentence } from "./sentence";

type CopyState =
	| { readonly kind: "idle" }
	| { readonly kind: "done"; readonly text: string }
	| { readonly kind: "failed"; readonly text: string };

export interface QuestionPick {
	readonly family: QuestionFamily;
	readonly option: QuestionOption;
}

interface QuestionCardSheetProps {
	readonly pick: QuestionPick | null;
	readonly size: BoardSize;
	readonly hiderName: string | null;
	/**
	 * Where the question is asked from. Editable, because half these families
	 * are measured from it and the fix a phone has is not always the point a
	 * seeker means — they may be answering for a spot they just left.
	 */
	readonly point: LngLat | null;
	readonly onPoint: (point: LngLat) => void;
	/** What a filled-in option reads as, where this is one. */
	readonly typed: string | undefined;
	readonly onClose: () => void;
}

/**
 * The last screen before a question is spent, and the only one with room for
 * a rule.
 *
 * `01-matching-questions.md` turned out to be mostly rules — a transit-line
 * question may only be asked from a moving vehicle, an express running through
 * the station is a no, the word "station" counts toward the name length — and
 * none of that fits under a chip on the board.
 *
 * The board says **Ask** and opens this; the card says **Send** and spends the
 * question. Send is inert until M6 wires the ask mutation up, and says so
 * rather than pretending.
 */
export function QuestionCardSheet({
	pick,
	size,
	hiderName,
	point,
	onPoint,
	typed,
	onClose,
}: QuestionCardSheetProps) {
	// Held so the sheet can animate out with the question it was opened on.
	const held = useHeldValue(pick !== null, pick);
	/**
	 * Which question was copied, not whether one was. The sheet is reused for
	 * every question on the board, so a boolean would still read "Copied" over
	 * the next one — and resetting it in an effect is syncing state that can be
	 * derived instead.
	 */
	const [copy, setCopy] = useState<CopyState>({ kind: "idle" });
	if (!held) return null;

	const { family, option } = held;
	const away = !isOnBoard(option, size) || !isOnBoard(family, size);
	const target = hiderName ?? "the hider";
	const clipboard = webPlatform.clipboard.capability().available;
	const text = questionText({ family, option, size, point, typed });
	const copyLabel =
		copy.kind === "idle" || copy.text !== text
			? "Copy the question"
			: copy.kind === "done"
				? "Copied"
				: "Copy failed";

	return (
		<Sheet
			actions={
				<>
					{/*
					 * The app cannot send a question yet, so the way one actually
					 * reaches a hider is a message somebody types. Copy hands over the
					 * whole thing — sentence, answer, clock, price, position and the
					 * rules that decide arguments — rather than leaving a seeker to
					 * retype it and leave half of it out.
					 */}
					<ActionButton
						data-testid="copy-question"
						disabled={!clipboard}
						onClick={() => {
							void webPlatform.clipboard
								.write(text)
								.then((ok) => setCopy({ kind: ok ? "done" : "failed", text }));
						}}
						size="comfortable"
						tone="secondary"
					>
						{copyLabel}
					</ActionButton>
					<ActionButton
						data-testid="send-question"
						disabled
						hint={`${family.name.toLowerCase()} · ${family.draw}→${family.keep}`}
					>
						Send to {target}
					</ActionButton>
				</>
			}
			onClose={onClose}
			open={pick !== null}
			testId="question-card"
		>
			<QuestionSentence
				className="text-[1.3rem]"
				parts={readSentence(family, option, size, typed)}
				testId="card-sentence"
			/>

			{away && (
				<InlineNotice testId="card-off-board" title="Not in this game">
					A {boardSizeName(smallestBoardSize(option)).toLowerCase()}-board{" "}
					{family.name.toLowerCase()} question, and this board is{" "}
					{boardSizeName(size).toLowerCase()}. Ask it anyway if the two of you
					have agreed to.
				</InlineNotice>
			)}

			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
				<Rule term="Answer">
					{family.answer}, within {family.minutes[size]} minutes
				</Rule>
				<Rule term={target}>
					Draws {family.draw} {family.draw === 1 ? "card" : "cards"}, keeps{" "}
					{family.keep}
				</Rule>
				{family.steps?.map((step, index) => (
					<Rule key={step} term={`Step ${index + 1}`}>
						{step}
					</Rule>
				))}
				{option.rule && <Rule term="The rule">{option.rule}</Rule>}
			</dl>

			{family.note && (
				<p className="flex items-start gap-2 text-[0.78rem] text-ink-faint leading-snug">
					<Icon className="mt-px shrink-0" name="info" size="sm" />
					<span>{family.note}</span>
				</p>
			)}

			<div className="flex flex-col gap-1">
				<span className="eyebrow">
					Every {family.name.toLowerCase()} question
				</span>
				<ul className="flex list-disc flex-col gap-1 pl-4 text-[0.78rem] text-ink-dim leading-snug">
					{family.rules.map((rule) => (
						<li key={rule}>{rule}</li>
					))}
				</ul>
			</div>

			<PointField
				label="Asking from"
				onPoint={onPoint}
				point={point}
				testIdPrefix="ask-from"
			/>
		</Sheet>
	);
}

function Rule({
	term,
	children,
}: {
	readonly term: string;
	readonly children: ReactNode;
}) {
	return (
		<>
			<dt className="eyebrow pt-0.5 text-ink-faint">{term}</dt>
			<dd className="text-[0.82rem] text-ink-dim leading-snug">{children}</dd>
		</>
	);
}
