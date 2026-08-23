import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "./panel";

const HIDING_DURATION_MS = 30 * 60 * 1000;

/**
 * A round is the unit of play, and roles belong to it rather than to the teams.
 * Which table hides is chosen here, every round — that choice is the whole
 * reason `roundTeamRole` exists instead of a column on `team`. m0-spec §5.
 */
export function Rounds() {
	const zero = useZero();
	const [teams] = useQuery(queries.teams());
	const [rounds] = useQuery(queries.rounds());
	const [hiderTeamId, setHiderTeamId] = useState<string | null>(null);

	const hider = teams.find((team) => team.id === hiderTeamId) ?? teams[0];
	/**
	 * Round 1 exists from game creation with `status: "pending"`, so starting a
	 * round is assign-then-begin rather than create. m1-spec §3. `round.create`
	 * stays for the rounds M5 adds after this one.
	 */
	const pending = rounds.find((round) => round.status === "pending");

	function createRound() {
		if (!hider || teams.length < 2) return;
		const roles = teams.map((team) => ({
			teamId: team.id,
			role: team.id === hider.id ? ("hider" as const) : ("seeker" as const),
		}));
		const eventId = crypto.randomUUID();

		if (pending) {
			void zero.mutate(
				mutators.round.assignRoles({ eventId, roundId: pending.id, roles }),
			);
			void zero.mutate(
				mutators.round.startHiding({
					eventId: crypto.randomUUID(),
					roundId: pending.id,
				}),
			);
			return;
		}

		const roundId = crypto.randomUUID();
		void zero.mutate(
			mutators.round.create({
				eventId,
				roundId,
				ordinal: rounds.length + 1,
				hidingDurationMs: HIDING_DURATION_MS,
				roles,
			}),
		);
		void zero.mutate(
			mutators.round.startHiding({
				eventId: crypto.randomUUID(),
				roundId,
			}),
		);
	}

	return (
		<Panel testId="rounds" title="Rounds">
			<div className="flex gap-2">
				<select
					className="flex-1 rounded border p-1"
					data-testid="hider-team"
					onChange={(event) => setHiderTeamId(event.target.value)}
					value={hider?.id ?? ""}
				>
					{teams.map((team) => (
						<option key={team.id} value={team.id}>
							{team.name} hides
						</option>
					))}
				</select>
				<button
					className="rounded border px-2"
					data-testid="create-round"
					disabled={teams.length < 2}
					onClick={createRound}
					type="button"
				>
					Start round {pending?.ordinal ?? rounds.length + 1}
				</button>
			</div>

			<ul className="space-y-1" data-testid="round-list">
				{rounds.map((round) => (
					<li className="flex items-center gap-2" key={round.id}>
						<span data-testid={`round-${round.ordinal}-status`}>
							#{round.ordinal} {round.status}
						</span>
						<button
							className="rounded border px-2 text-xs"
							data-testid={`round-${round.ordinal}-seek`}
							disabled={round.status !== "hiding"}
							onClick={() =>
								void zero.mutate(
									mutators.round.startSeeking({
										eventId: crypto.randomUUID(),
										roundId: round.id,
									}),
								)
							}
							type="button"
						>
							Seeking
						</button>
						<button
							className="rounded border px-2 text-xs"
							data-testid={`round-${round.ordinal}-end`}
							disabled={round.status === "ended"}
							onClick={() =>
								void zero.mutate(
									mutators.round.end({
										eventId: crypto.randomUUID(),
										roundId: round.id,
									}),
								)
							}
							type="button"
						>
							End
						</button>
					</li>
				))}
			</ul>
		</Panel>
	);
}
