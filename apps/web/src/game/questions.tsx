import { useQuery, useZero } from "@rocicorp/zero/react";
import { webPlatform } from "@zero-lag/platform/web";
import { mutators, type PositionReason, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "./panel";
import type { MyRole } from "./use-role";

const RADIUS_CHOICES = [500, 1000, 3000] as const;

interface QuestionsProps {
	playerId: string;
	role: MyRole;
	onSample: (reason: PositionReason) => void;
}

export function Questions({ playerId, role, onSample }: QuestionsProps) {
	const zero = useZero();
	const [questions] = useQuery(queries.questions());
	const [teams] = useQuery(queries.teams());
	const [players] = useQuery(queries.players());
	/** Questions this device has submitted an answer for, won or lost. */
	const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

	const hiderTeam = teams.find((team) => team.id !== role.teamId);

	async function ask(radiusMeters: number) {
		if (!role.roundId || !role.teamId || !hiderTeam) return;
		const askPosition = await webPlatform.location.getCurrent();
		onSample("question.asked");
		void zero.mutate(
			mutators.question.ask({
				eventId: crypto.randomUUID(),
				questionId: crypto.randomUUID(),
				roundId: role.roundId,
				askingTeamId: role.teamId,
				targetTeamId: hiderTeam.id,
				radiusMeters,
				askPosition,
			}),
		);
	}

	async function answer(questionId: string, askedAt: number, value: boolean) {
		const answerPosition = await webPlatform.location.getCurrent();
		onSample("question.answered");
		setAttempted((previous) => new Set(previous).add(questionId));

		const result = zero.mutate(
			mutators.question.answer({
				eventId: crypto.randomUUID(),
				answerId: crypto.randomUUID(),
				constraintId: crypto.randomUUID(),
				questionId,
				value: { kind: "boolean", value },
				answerPosition,
				clientSubmittedAt: Date.now(),
				// Elapsed on this device between receiving the question and
				// answering it. Displayed, never enforced: the deadline is a game
				// rule the app does not police. m0-spec §7.
				answeredAfterMs: Math.max(0, Date.now() - askedAt),
			}),
		);

		/**
		 * Awaited so the write is not left dangling, but deliberately not read.
		 *
		 * `result.server` resolves with an outcome rather than rejecting, and a
		 * mutation that was queued through a reconnect and rebased reports success
		 * here even where the server rejected it. Losing the race is detected
		 * below instead, from state that has definitely arrived.
		 */
		await result.server;
	}

	/**
	 * Derived, not stored: I answered this question, and the answer that exists
	 * is somebody else's. That is exactly what being superseded means, read off
	 * synced state rather than off a mutation result.
	 *
	 * The winner's name comes from the same place, so the notice never depends
	 * on how much of `ApplicationError.details` survived the round trip.
	 */
	const superseded = questions.find(
		(question) =>
			attempted.has(question.id) &&
			!dismissed.has(question.id) &&
			question.answers[0] !== undefined &&
			question.answers[0].answeringPlayerId !== playerId,
	);
	const winner = players.find(
		(player) => player.id === superseded?.answers[0]?.answeringPlayerId,
	);

	return (
		<Panel testId="questions" title="Questions">
			{role.role === "seeker" && (
				<div className="flex gap-2" data-testid="ask-controls">
					{RADIUS_CHOICES.map((radius) => (
						<button
							className="rounded border px-2"
							data-testid={`ask-radar-${radius}`}
							disabled={!role.roundId || !hiderTeam}
							key={radius}
							onClick={() => void ask(radius)}
							type="button"
						>
							Radar {radius}m
						</button>
					))}
				</div>
			)}

			<ul className="space-y-1" data-testid="question-list">
				{questions.map((question) => {
					const given = question.answers[0];
					const radius =
						typeof question.params === "object" &&
						question.params !== null &&
						!Array.isArray(question.params) &&
						typeof question.params.radiusMeters === "number"
							? question.params.radiusMeters
							: 0;

					return (
						<li
							className="flex items-center gap-2"
							data-question-id={question.id}
							key={question.id}
						>
							<span data-testid={`question-${question.id}`}>
								radar {radius}m — {question.status}
							</span>
							{given ? (
								<>
									<span data-testid={`answer-${question.id}`}>
										{given.value.value ? "yes" : "no"}
									</span>
									<span
										className="text-xs"
										data-testid={`answered-after-${question.id}`}
									>
										in {Math.round(given.answeredAfterMs / 1000)}s
									</span>
									{/*
									 * A debug affordance, and the only way to drive acceptance
									 * test 4 from the UI: re-submitting your own answer must be
									 * a silent success rather than a duplicate or a discard.
									 */}
									{given.answeringPlayerId === playerId && (
										<button
											className="rounded border px-2 text-xs"
											data-testid={`retry-answer-${question.id}`}
											onClick={() =>
												void answer(
													question.id,
													question.askedAt,
													given.value.value,
												)
											}
											type="button"
										>
											Re-submit
										</button>
									)}
								</>
							) : (
								role.role === "hider" && (
									<>
										<button
											className="rounded border px-2 text-xs"
											data-testid={`answer-yes-${question.id}`}
											onClick={() =>
												void answer(question.id, question.askedAt, true)
											}
											type="button"
										>
											Yes
										</button>
										<button
											className="rounded border px-2 text-xs"
											data-testid={`answer-no-${question.id}`}
											onClick={() =>
												void answer(question.id, question.askedAt, false)
											}
											type="button"
										>
											No
										</button>
									</>
								)
							)}
						</li>
					);
				})}
			</ul>

			{/*
			 * One dismissible notice and nothing further. No retry, no log entry,
			 * and no notification to anyone else — a discard is not an event.
			 */}
			{superseded && (
				<div
					className="rounded border border-amber-500 p-2 text-sm"
					data-testid="discard-notice"
				>
					<span>
						Your answer was discarded, {winner?.displayName ?? "a teammate"}{" "}
						answered first.
					</span>
					<button
						className="ml-2 rounded border px-2 text-xs"
						data-testid="dismiss-discard"
						onClick={() =>
							setDismissed((previous) => new Set(previous).add(superseded.id))
						}
						type="button"
					>
						Dismiss
					</button>
				</div>
			)}
		</Panel>
	);
}
