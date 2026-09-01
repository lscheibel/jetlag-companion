import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { PhotoImage } from "../game/photo-image";
import { formatClock } from "../game/round-clock";

interface HiderResultProps {
	readonly teamId: string;
	readonly teamName: string;
	readonly token: string;
}

/**
 * How this hider team is doing, on the team itself rather than in a second
 * list. The mark and the undo live on the seeker's map.
 */
export function HiderResult({ teamId, teamName, token }: HiderResultProps) {
	const [rounds] = useQuery(queries.rounds());
	const [teams] = useQuery(queries.teams());
	const [outcomes] = useQuery(queries.hiderOutcomes());
	const round = rounds.at(-1);
	if (!round || round.status === "pending") return null;
	const isHider = round.roles.some(
		(assignment) => assignment.teamId === teamId && assignment.role === "hider",
	);
	if (!isHider) return null;

	const outcome = outcomes.find(
		(value) => value.roundId === round.id && value.hiderTeamId === teamId,
	);
	const seeker = teams.find((value) => value.id === outcome?.seekerTeamId);

	return (
		<div
			className="rounded-control border border-hairline bg-surface px-3 py-2 text-sm leading-snug"
			data-testid={`outcome-${teamName}`}
		>
			{outcome?.foundAt ? (
				<>
					<p>
						Found by {seeker?.name ?? "a seeker team"} after{" "}
						<span
							className="tabular-nums"
							data-testid={`outcome-duration-${teamName}`}
						>
							{formatClock(outcome.durationMillis ?? 0)}
						</span>
					</p>
					{outcome.photoId && (
						<PhotoImage
							alt={`${teamName} found`}
							className="mt-2 max-h-48 w-full rounded object-cover"
							photoId={outcome.photoId}
							token={token}
						/>
					)}
				</>
			) : (
				<p data-testid={`outcome-unfound-${teamName}`}>
					{round.status === "ended" ? "Not found" : "Still hiding"}
				</p>
			)}
		</div>
	);
}
