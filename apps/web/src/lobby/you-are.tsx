import type { ReactNode } from "react";
import type { LobbyTeamView } from "./model";

/**
 * Where you sit in this game, above the ready button — the one line the
 * board does not have to shout from a highlighted card.
 */

interface YouAreProps {
	team: LobbyTeamView;
	playerId: string;
}

export function YouAre({ team, playerId }: YouAreProps) {
	if (team.role !== "hider" && team.role !== "seeker") return null;

	const side = team.role === "hider" ? "hiding" : "seeking";
	const others = team.members
		.filter((person) => person.id !== playerId)
		.map((person) => person.displayName);

	return (
		<span data-testid="you-are">
			{others.length === 0 ? (
				<>
					You are <Mark>{side}</Mark> as <Mark>{team.name}</Mark>.
				</>
			) : (
				<>
					You are <Mark>{side}</Mark> as <Mark>{team.name}</Mark> with{" "}
					<Mark>{andList(others)}</Mark>.
				</>
			)}
		</span>
	);
}

function Mark({ children }: { children: ReactNode }) {
	return <span className="font-semibold text-ink">{children}</span>;
}

function andList(names: readonly string[]): string {
	const [first, ...rest] = names;
	if (first === undefined) return "";
	if (rest.length === 0) return first;
	const last = rest[rest.length - 1];
	if (last === undefined) return first;
	if (rest.length === 1) return `${first} and ${last}`;
	return `${[first, ...rest.slice(0, -1)].join(", ")} and ${last}`;
}
