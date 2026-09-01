import { useQuery, useZero } from "@rocicorp/zero/react";
import type { PauseInterval } from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { useNow } from "../map/use-now";
import { clockReadout, formatHms, runningClock } from "./round-clock";

/**
 * Correcting a clock that is running.
 *
 * What is wrong is almost never the clock — it is when somebody tapped start.
 * A phase that began ten minutes before anyone remembered to say so leaves
 * every device counting ten minutes short, and both phase clocks are derived
 * from one stored instant each, so the instant is the fix. m5-spec §8 keeps
 * the live clocks derived precisely so there is one number to correct rather
 * than a second offset for three renderings to disagree about.
 *
 * So what this sheet edits is a point in time. The steps and the readout are
 * two ways of naming it, and the field spells it out.
 *
 * **Anyone may do it.** Whoever notices the clock is short is usually whoever
 * forgot to tap, and sending them to find a host is how the clock stays wrong.
 */

/** Minutes a single tap moves the clock by, largest first. */
const STEPS_MINUTES = [5, 1] as const;
const MINUTE_MS = 60_000;

interface TimerSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** The round whose clock the bar is showing, so the two cannot diverge. */
	readonly roundId: string;
}

export function TimerSheet({ open, onClose, roundId }: TimerSheetProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	// The device's own clock, matching the bar. See `RoundBar` for why the
	// ephemeral clock offset is not applied to either.
	const now = useNow(1_000);
	const [draft, setDraft] = useState<number | null>(null);

	const live = rounds.find((candidate) => candidate.id === roundId);
	const liveClock = live ? runningClock(live) : null;
	// Held so a dismissed sheet animates out with the clock it was opened on
	// rather than emptying first.
	const round = useHeldValue(open, live);
	const clock = useHeldValue(open, liveClock);

	/**
	 * A draft belongs to one opening of one phase's clock. Reopening — or a host
	 * starting seeking while this is up — is a different clock, and it starts
	 * from what that one actually says rather than from an edit meant for the
	 * clock before it.
	 */
	const session = open ? `${roundId}:${liveClock?.phase ?? "none"}` : "closed";
	const [lastSession, setLastSession] = useState(session);
	if (session !== lastSession) {
		setLastSession(session);
		setDraft(null);
	}

	const roundPauses = pauses.filter((pause) => pause.roundId === roundId);
	const startedAt = draft ?? clock?.startedAt ?? null;
	const changed = clock !== null && startedAt !== clock.startedAt;

	function clamp(candidate: number): number {
		if (!clock || !round || startedAt === null) return candidate;
		return clampStart(candidate, clock.phase, round, now, startedAt);
	}

	const problem =
		clock && round && startedAt !== null
			? startProblem(startedAt, clock.phase, round, now)
			: null;

	function apply() {
		if (!clock || startedAt === null || !changed || problem !== null) return;
		void zero.mutate(
			mutators.round.correctClock({
				eventId: crypto.randomUUID(),
				roundId,
				phase: clock.phase,
				startedAt,
			}),
		);
		onClose();
	}

	return (
		<Sheet
			actions={
				<ActionButton
					data-testid="apply-clock-correction"
					disabled={!changed || problem !== null}
					onClick={apply}
				>
					Set the clock
				</ActionButton>
			}
			eyebrow={clock ? `${clock.phase} clock` : undefined}
			onClose={onClose}
			open={open}
			testId="timer-sheet"
			title="Correct the clock"
		>
			{clock && round && startedAt !== null ? (
				<ClockDraft
					clamp={clamp}
					durationMs={round.hidingDurationMs}
					now={now}
					onCommit={(candidate) => setDraft(clamp(candidate))}
					onType={setDraft}
					pauses={roundPauses}
					phase={clock.phase}
					problem={problem}
					startedAt={startedAt}
					wasStartedAt={clock.startedAt}
				/>
			) : (
				<p className="py-4 text-ink-dim text-sm leading-snug">
					This round has no clock running.
				</p>
			)}
		</Sheet>
	);
}

interface ClockDraftProps {
	readonly phase: "hiding" | "seeking";
	readonly startedAt: number;
	/** What the round still says, so the sheet can show what is being changed. */
	readonly wasStartedAt: number;
	readonly durationMs: number;
	readonly pauses: readonly PauseInterval[];
	readonly now: number;
	readonly problem: string | null;
	readonly clamp: (candidate: number) => number;
	readonly onCommit: (startedAt: number) => void;
	/** Typed instants land as typed. Only the steps are held to the bounds. */
	readonly onType: (startedAt: number) => void;
}

/**
 * The draft: what the clock would read, four steps either side of it, and the
 * instant itself.
 *
 * The readout goes through the same `clockReadout` the round bar uses, so a
 * correction that steps across a pause previews what the bar will actually
 * say rather than the arithmetic somebody expected.
 */
function ClockDraft({
	phase,
	startedAt,
	wasStartedAt,
	durationMs,
	pauses,
	now,
	problem,
	clamp,
	onCommit,
	onType,
}: ClockDraftProps) {
	const reading = clockReadout(phase, startedAt, durationMs, pauses, now);
	const current = clockReadout(phase, wasStartedAt, durationMs, pauses, now);
	const steps = [...STEPS_MINUTES]
		.map((minutes) => -minutes)
		.concat([...STEPS_MINUTES].reverse());

	return (
		<>
			<div className="flex flex-col items-center gap-1 py-1">
				<p
					className="num font-medium text-3xl leading-none"
					data-testid="clock-preview"
				>
					{reading}
				</p>
				<p className="text-ink-dim text-xs">
					{startedAt === wasStartedAt
						? phase === "hiding"
							? "Time left in the hiding phase."
							: "Time spent seeking."
						: `Now reads ${current}.`}
				</p>
			</div>
			<div className="grid grid-cols-4 gap-2">
				{steps.map((minutes) => {
					const next = clamp(steppedStart(startedAt, phase, minutes));
					return (
						<ActionButton
							data-testid={`clock-step-${minutes > 0 ? "plus" : "minus"}-${Math.abs(minutes)}`}
							disabled={next === startedAt}
							key={minutes}
							onClick={() => onCommit(next)}
							size="compact"
							tone="secondary"
						>
							{minutes > 0 ? "+" : "−"}
							{Math.abs(minutes)}m
						</ActionButton>
					);
				})}
			</div>
			{/*
			 * Typed instants are taken as typed and judged afterwards, rather
			 * than folded into the nearest allowed value. A picker that silently
			 * rewrites what you dialled reads as a picker that will not scroll.
			 */}
			<Field
				data-testid="clock-started-at"
				hint={
					phase === "hiding"
						? `The hiding phase began then, and runs for ${formatHms(durationMs)}.`
						: "Seeking began then, and never before hiding did."
				}
				label="Started at"
				onChange={(event) => {
					const resolved = resolveTimeInput(event.target.value, now);
					if (resolved !== null) onType(resolved);
				}}
				problem={problem}
				step={1}
				type="time"
				value={timeInputValue(startedAt)}
			/>
		</>
	);
}

/**
 * The instant that makes the clock read `minutes` more, or less.
 *
 * A countdown gains time by having started later; a count-up clock gains it by
 * having started earlier. This is the only place the two phases disagree about
 * direction, and the buttons are labelled for the number on screen because
 * that is the number somebody is complaining about.
 */
export function steppedStart(
	startedAt: number,
	phase: "hiding" | "seeking",
	minutes: number,
): number {
	return startedAt + (phase === "hiding" ? 1 : -1) * minutes * MINUTE_MS;
}

/**
 * What a step is allowed to reach, given where it starts from.
 *
 * A bound stops a value being pushed further out; it never drags one that is
 * already outside back in. A countdown that expired an hour ago is a real
 * state of a real round, and snapping it to `now` on the first tap of a
 * five-minute button is a one-hour edit nobody asked for — so `current`
 * widens the range it sits outside of rather than being corrected by it.
 *
 * The bounds themselves are only the two the mutator also enforces: nothing
 * starts in the future, and seeking never begins before hiding did. "The
 * hiding countdown has run out" is not among them — that is a thing a round
 * is allowed to be, not a thing to stop somebody saying.
 */
export function clampStart(
	candidate: number,
	phase: "hiding" | "seeking",
	round: { readonly hidingStartedAt: number | null },
	now: number,
	current: number,
): number {
	const ceiling = Math.max(now, current);
	const floor =
		phase === "seeking" && round.hidingStartedAt !== null
			? Math.min(round.hidingStartedAt, current)
			: Number.NEGATIVE_INFINITY;
	return Math.min(ceiling, Math.max(floor, candidate));
}

/**
 * Why an instant cannot be written, in the player's words, or null when it
 * can. The same two conditions `round.correctClock` refuses on, asked before
 * the write rather than after it.
 */
export function startProblem(
	candidate: number,
	phase: "hiding" | "seeking",
	round: { readonly hidingStartedAt: number | null },
	now: number,
): string | null {
	if (candidate > now)
		return "That is still to come. Pick a time already past.";
	if (
		phase === "seeking" &&
		round.hidingStartedAt !== null &&
		candidate < round.hidingStartedAt
	) {
		return `Seeking cannot have started before hiding did, at ${timeInputValue(round.hidingStartedAt)}.`;
	}
	return null;
}

/** `HH:MM:SS` in the device's own timezone, which is what `type="time"` wants. */
export function timeInputValue(at: number): string {
	const date = new Date(at);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => part.toString().padStart(2, "0"))
		.join(":");
}

/**
 * The instant nearest `reference` whose local wall time is the one typed.
 *
 * Nearest rather than "the most recent at or before": a minute nudged past the
 * present is a minute in the future and should be refused as one, not silently
 * rewritten to the same time yesterday — a twenty-four hour edit disguised as
 * a scroll. A game that ran past midnight still reads back correctly the next
 * morning, because at 00:10 last night's 23:40 is half an hour away and
 * tonight's is twenty-three and a half.
 *
 * The day steps through `setDate` rather than by subtracting a day in
 * milliseconds, so it stays true across the two nights a year that are not
 * twenty-four hours long.
 */
export function resolveTimeInput(
	raw: string,
	reference: number,
): number | null {
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = match[3] === undefined ? 0 : Number(match[3]);
	if (hours > 23 || minutes > 59 || seconds > 59) return null;

	const sameDay = new Date(reference);
	sameDay.setHours(hours, minutes, seconds, 0);
	const dayBefore = new Date(sameDay);
	dayBefore.setDate(dayBefore.getDate() - 1);

	return Math.abs(sameDay.getTime() - reference) <=
		Math.abs(dayBefore.getTime() - reference)
		? sameDay.getTime()
		: dayBefore.getTime();
}
