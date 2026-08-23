import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { Panel } from "../game/panel";
import { PhotoImage } from "../game/photo-image";
import { formatClock } from "../game/round-bar";

interface OutcomeListProps {
	token: string;
}

export function OutcomeList({ token }: OutcomeListProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [teams] = useQuery(queries.teams());
	const [outcomes] = useQuery(queries.hiderOutcomes());
	const round = rounds.at(-1);

	if (!round) return null;
	const hiders = round.roles.filter((role) => role.role === "hider");

	return (
		<Panel testId="outcome-list" title="Hider results">
			{hiders.length === 0 ? (
				<p>No hider teams assigned.</p>
			) : (
				<ul className="space-y-3">
					{hiders.map((role) => {
						const team = teams.find((value) => value.id === role.teamId);
						const outcome = outcomes.find(
							(value) =>
								value.roundId === round.id && value.hiderTeamId === role.teamId,
						);
						const seeker = teams.find(
							(value) => value.id === outcome?.seekerTeamId,
						);
						return (
							<li
								className="space-y-2 rounded border p-3"
								data-testid={`outcome-${team?.name ?? role.teamId}`}
								key={role.teamId}
							>
								<p className="font-medium">{team?.name ?? "Hider team"}</p>
								{outcome?.foundAt ? (
									<>
										<p>
											Found by {seeker?.name ?? "a seeker team"} after{" "}
											<span
												className="tabular-nums"
												data-testid={`outcome-duration-${team?.name ?? role.teamId}`}
											>
												{formatClock(outcome.durationMillis ?? 0)}
											</span>
										</p>
										{outcome.photoId && (
											<PhotoImage
												alt={`${team?.name ?? "Hider"} found`}
												className="max-h-64 w-full rounded object-cover"
												photoId={outcome.photoId}
												token={token}
											/>
										)}
										{round.status === "seeking" && (
											<button
												className="min-h-11 rounded border px-3 text-sm"
												data-testid={`unmark-found-${team?.name ?? role.teamId}`}
												onClick={() =>
													void zero.mutate(
														mutators.round.unmarkFound({
															eventId: crypto.randomUUID(),
															roundId: round.id,
															hiderTeamId: role.teamId,
														}),
													)
												}
												type="button"
											>
												Undo found
											</button>
										)}
									</>
								) : (
									<p
										data-testid={`outcome-unfound-${team?.name ?? role.teamId}`}
									>
										{round.status === "ended" ? "Not found" : "Still hiding"}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}
