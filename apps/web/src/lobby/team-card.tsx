import type { TeamRole } from "@zero-lag/schema";
import { useState } from "react";
import { useLobbyActions } from "./actions";
import type { LobbyPlayer } from "./player-row";
import { PlayerRow } from "./player-row";
import { TeamBadge, type TeamIdentity } from "./team-badge";
import { TeamEditor } from "./team-editor";

export interface LobbyTeam extends TeamIdentity {
	readonly id: string;
	readonly members: readonly LobbyPlayer[];
}

interface TeamCardProps {
	team: LobbyTeam;
	teams: readonly LobbyTeam[];
	role: TeamRole | null;
	myPlayerId: string;
	amHost: boolean;
}

/**
 * One team. Its badge, who is on it, and the controls that belong to whoever is
 * looking: join or leave is yours, editing is the team's, deleting is the
 * host's. m1-spec §4, §6.
 */
export function TeamCard({
	team,
	teams,
	role,
	myPlayerId,
	amHost,
}: TeamCardProps) {
	const { joinTeam, leaveTeam, deleteTeam } = useLobbyActions();
	const [editing, setEditing] = useState(false);
	const amMember = team.members.some((member) => member.id === myPlayerId);

	return (
		<section
			className="space-y-2 rounded border p-3"
			data-testid={`team-${team.name}`}
		>
			<div className="flex flex-wrap items-center gap-2">
				<TeamBadge team={team} />
				{role && (
					<span
						className="rounded border px-2 py-1 text-xs"
						data-testid={`role-${team.name}`}
					>
						{role}
					</span>
				)}

				{amMember ? (
					<button
						className="ml-auto min-h-11 rounded border px-3 text-sm"
						data-testid={`leave-${team.name}`}
						onClick={() => leaveTeam(team.id)}
						type="button"
					>
						Leave
					</button>
				) : (
					<button
						className="ml-auto min-h-11 rounded border px-3 text-sm"
						data-testid={`join-${team.name}`}
						onClick={() => joinTeam(team.id)}
						type="button"
					>
						Join
					</button>
				)}

				{/*
				 * Offered on every team, not only your own. Tapping "Edit" on
				 * somebody else's team is a plausible mistake in a shared lobby, and
				 * a clear refusal answers it better than a dead control that explains
				 * nothing. The mutator is what enforces it. m1-spec §4.
				 */}
				<button
					className="min-h-11 rounded border px-3 text-sm"
					data-testid={`edit-${team.name}`}
					onClick={() => setEditing((open) => !open)}
					type="button"
				>
					{editing ? "Close" : "Edit"}
				</button>

				{amHost && (
					<button
						className="min-h-11 rounded border px-3 text-sm"
						data-testid={`delete-${team.name}`}
						onClick={() => deleteTeam(team.id)}
						type="button"
					>
						Delete
					</button>
				)}
			</div>

			{editing && (
				<TeamEditor
					onDone={() => setEditing(false)}
					team={team}
					teamId={team.id}
					teams={teams}
				/>
			)}

			<ul data-testid={`members-${team.name}`}>
				{team.members.map((member) => (
					<PlayerRow
						amHost={amHost}
						isMe={member.id === myPlayerId}
						key={member.id}
						player={member}
					/>
				))}
			</ul>
		</section>
	);
}
