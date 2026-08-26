import { useQuery, useZero } from "@rocicorp/zero/react";
import { elapsed } from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "../game/panel";
import { useNow } from "../map/use-now";

interface RoundControlsProps {
	amHost: boolean;
}

export function RoundControls({ amHost }: RoundControlsProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const [minutes, setMinutes] = useState("30");
	const now = useNow(1_000);
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);

	if (!round) {
		return (
			<Panel testId="round-controls" title="Round">
				<p>No active round. Assign roles for the next round.</p>
			</Panel>
		);
	}

	const openPause = pauses.find(
		(pause) => pause.roundId === round.id && pause.endedAt === null,
	);
	const hidingTimeUp =
		round.status === "hiding" &&
		round.hidingStartedAt !== null &&
		elapsed(
			round.hidingStartedAt,
			pauses.filter((pause) => pause.roundId === round.id),
			now,
		) >= round.hidingDurationMs;

	const event = () => ({ eventId: crypto.randomUUID() });
	const startHiding = () => {
		const hidingDurationMs = Math.max(
			1_000,
			Math.round(Number(minutes) * 60_000),
		);
		void zero.mutate(
			mutators.round.startHiding({
				...event(),
				roundId: round.id,
				hidingDurationMs,
			}),
		);
	};

	return (
		<Panel testId="round-controls" title={`Round ${round.ordinal}`}>
			<p className="capitalize" data-testid="lobby-round-phase">
				{round.status}
				{openPause ? ` · paused: ${openPause.reason}` : ""}
			</p>
			{!amHost && (
				<p className="text-ink-dim text-sm">A host controls the round.</p>
			)}
			{amHost && round.status === "pending" && (
				<div className="space-y-2">
					<label className="block text-sm" htmlFor="hiding-duration">
						Hiding time (minutes)
					</label>
					<input
						className="min-h-11 w-full rounded border px-3"
						data-testid="hiding-duration"
						id="hiding-duration"
						min="0.02"
						onChange={(event) => setMinutes(event.target.value)}
						step="0.01"
						type="number"
						value={minutes}
					/>
					<button
						className="min-h-11 w-full rounded border px-4 font-semibold"
						data-testid="start-hiding"
						disabled={
							round.roles.length < 2 ||
							!Number.isFinite(Number(minutes)) ||
							Number(minutes) <= 0
						}
						onClick={startHiding}
						type="button"
					>
						Start hiding
					</button>
				</div>
			)}
			{amHost && round.status === "hiding" && !openPause && (
				<button
					className={`min-h-11 w-full rounded border px-4 font-semibold ${
						hidingTimeUp ? "bg-action text-action-ink" : ""
					}`}
					data-testid="start-seeking"
					onClick={() =>
						void zero.mutate(
							mutators.round.startSeeking({
								...event(),
								roundId: round.id,
							}),
						)
					}
					type="button"
				>
					{hidingTimeUp ? "Hiding time is up — start seeking" : "Start seeking"}
				</button>
			)}
			{amHost &&
				(round.status === "hiding" || round.status === "seeking") &&
				openPause && (
					<button
						className="min-h-11 w-full rounded border px-4 font-semibold"
						data-testid="resume-round"
						onClick={() =>
							void zero.mutate(
								mutators.round.resume({
									...event(),
									roundId: round.id,
								}),
							)
						}
						type="button"
					>
						Resume
					</button>
				)}
		</Panel>
	);
}
