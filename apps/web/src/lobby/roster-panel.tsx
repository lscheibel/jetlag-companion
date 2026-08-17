import { useState } from "react";
import { useLobbyActions } from "./actions";
import { suggestIdentity } from "./palette";
import type { LobbyPlayer } from "./player-row";
import { PlayerRow } from "./player-row";
import type { LobbyTeam } from "./team-card";
import { TeamCard } from "./team-card";

interface RosterPanelProps {
	teams: readonly LobbyTeam[];
	unassigned: readonly LobbyPlayer[];
	removed: readonly LobbyPlayer[];
	roleByTeamId: ReadonlyMap<string, "seeker" | "hider">;
	myPlayerId: string;
	amHost: boolean;
}

/** Every team, every member, and everyone still deciding. m1-spec §11. */
export function RosterPanel({
	teams,
	unassigned,
	removed,
	roleByTeamId,
	myPlayerId,
	amHost,
}: RosterPanelProps) {
	return (
		<section className="space-y-3" data-testid="roster">
			<ul className="space-y-3" data-testid="teams">
				{teams.map((team) => (
					<li key={team.id}>
						<TeamCard
							amHost={amHost}
							myPlayerId={myPlayerId}
							role={roleByTeamId.get(team.id) ?? null}
							team={team}
							teams={teams}
						/>
					</li>
				))}
			</ul>

			{amHost && <AddTeam teams={teams} />}

			<UnassignedList
				amHost={amHost}
				myPlayerId={myPlayerId}
				players={unassigned}
			/>

			{removed.length > 0 && <RemovedList amHost={amHost} players={removed} />}
		</section>
	);
}

/**
 * Host only: how many teams there are is a property of the game rather than of
 * anyone's presentation. A new team arrives with the first colour and emoji
 * nobody has taken, so it is distinct before anyone touches it. m1-spec §4.
 */
function AddTeam({ teams }: { teams: readonly LobbyTeam[] }) {
	const { createTeam } = useLobbyActions();
	const [name, setName] = useState("");

	function create() {
		createTeam({ name: name.trim(), ...suggestIdentity(teams) });
		setName("");
	}

	return (
		<div className="flex gap-2">
			<input
				aria-label="New team name"
				className="min-h-11 flex-1 rounded border px-2"
				data-testid="team-name"
				onChange={(event) => setName(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && name.trim().length > 0) create();
				}}
				placeholder="Team name"
				value={name}
			/>
			<button
				className="min-h-11 rounded border px-3"
				data-testid="create-team"
				disabled={name.trim().length === 0}
				onClick={create}
				type="button"
			>
				Add team
			</button>
		</div>
	);
}

/**
 * Players who have not picked a team yet. They can see the whole lobby — every
 * team, every player — because presence withholds positions and nothing else.
 * m1-spec §9.
 */
function UnassignedList({
	players,
	myPlayerId,
	amHost,
}: {
	players: readonly LobbyPlayer[];
	myPlayerId: string;
	amHost: boolean;
}) {
	return (
		<section className="space-y-1 rounded border border-dashed p-3">
			<h2 className="font-semibold text-sm">No team yet</h2>
			<ul data-testid="unassigned">
				{players.map((player) => (
					<PlayerRow
						amHost={amHost}
						isMe={player.id === myPlayerId}
						key={player.id}
						player={player}
					/>
				))}
			</ul>
			{players.length === 0 && (
				<p className="text-muted-foreground text-sm">Everyone has a team.</p>
			)}
		</section>
	);
}

/** Removal is a column, not a delete, so getting somebody back is a tap. m1-spec §7. */
function RemovedList({
	players,
	amHost,
}: {
	players: readonly LobbyPlayer[];
	amHost: boolean;
}) {
	const { readmitPlayer } = useLobbyActions();

	return (
		<section className="space-y-1 rounded border border-dashed p-3">
			<h2 className="font-semibold text-sm">Removed</h2>
			<ul data-testid="removed">
				{players.map((player) => (
					<li
						className="flex min-h-11 items-center gap-2"
						data-testid={`removed-${player.displayName}`}
						key={player.id}
					>
						<span>{player.displayName}</span>
						{amHost && (
							<button
								className="ml-auto min-h-11 rounded border px-3 text-sm"
								data-testid={`readmit-${player.displayName}`}
								onClick={() => readmitPlayer(player.id)}
								type="button"
							>
								Let back in
							</button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
