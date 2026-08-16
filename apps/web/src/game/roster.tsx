import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "./panel";

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];
const EMOJI = ["🦊", "🐙", "🦉", "🐝"];

interface RosterProps {
	playerId: string;
	myTeamId: string | null;
}

export function Roster({ playerId, myTeamId }: RosterProps) {
	const zero = useZero();
	const [players] = useQuery(queries.players());
	const [teams] = useQuery(queries.teams());
	const [name, setName] = useState("");

	function createTeam() {
		const index = teams.length % COLORS.length;
		void zero.mutate(
			mutators.team.create({
				eventId: crypto.randomUUID(),
				teamId: crypto.randomUUID(),
				name,
				color: COLORS[index] ?? "#666666",
				emoji: EMOJI[index] ?? "🎯",
			}),
		);
		setName("");
	}

	return (
		<Panel testId="roster" title="Roster">
			<ul data-testid="players">
				{players.map((player) => (
					<li data-testid={`player-${player.displayName}`} key={player.id}>
						{player.displayName}
						{player.id === playerId ? " (you)" : ""}
					</li>
				))}
			</ul>

			<div className="flex gap-2">
				<input
					className="flex-1 rounded border p-1"
					data-testid="team-name"
					onChange={(event) => setName(event.target.value)}
					placeholder="Team name"
					value={name}
				/>
				<button
					className="rounded border px-2"
					data-testid="create-team"
					disabled={name.length === 0}
					onClick={createTeam}
					type="button"
				>
					Add team
				</button>
			</div>

			<ul className="space-y-1" data-testid="teams">
				{teams.map((team) => (
					<li className="flex items-center gap-2" key={team.id}>
						<span style={{ color: team.color }}>{team.emoji}</span>
						<span data-testid={`team-${team.name}`}>{team.name}</span>
						<span className="text-xs">
							({team.members.map((m) => m.player?.displayName).join(", ")})
						</span>
						{myTeamId === team.id ? (
							<button
								className="rounded border px-2 text-xs"
								data-testid={`leave-${team.name}`}
								onClick={() =>
									void zero.mutate(
										mutators.team.leave({
											eventId: crypto.randomUUID(),
											teamId: team.id,
										}),
									)
								}
								type="button"
							>
								Leave
							</button>
						) : (
							<button
								className="rounded border px-2 text-xs"
								data-testid={`join-${team.name}`}
								onClick={() =>
									void zero.mutate(
										mutators.team.join({
											eventId: crypto.randomUUID(),
											teamId: team.id,
										}),
									)
								}
								type="button"
							>
								Join
							</button>
						)}
					</li>
				))}
			</ul>
		</Panel>
	);
}
