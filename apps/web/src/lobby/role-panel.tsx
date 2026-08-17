import type { TeamRole } from "@zero-lag/schema";
import { useLobbyActions } from "./actions";
import { TeamBadge } from "./team-badge";
import type { LobbyTeam } from "./team-card";

interface RolePanelProps {
	roundId: string | null;
	teams: readonly LobbyTeam[];
	roleByTeamId: ReadonlyMap<string, TeamRole>;
	amHost: boolean;
}

/**
 * _n_ seeker teams × _m_ hider teams, assigned in the lobby. m1-spec §3.
 *
 * The roles are written to round 1, which exists from the moment the game does
 * with `status: "pending"` — so a team never needs a role column, and this is
 * literally the write M5 makes to swap sides between rounds.
 */
export function RolePanel({
	roundId,
	teams,
	roleByTeamId,
	amHost,
}: RolePanelProps) {
	const { assignRoles } = useLobbyActions();

	function set(teamId: string, role: TeamRole | null) {
		if (!roundId) return;
		// The event carries the full assignment every time, so a replay reader
		// never has to accumulate to know the state of the board. m1-spec §10.
		const next = teams.flatMap((team) => {
			const value =
				team.id === teamId ? role : (roleByTeamId.get(team.id) ?? null);
			return value ? [{ teamId: team.id, role: value }] : [];
		});
		assignRoles(roundId, next);
	}

	return (
		<section className="space-y-2 rounded border p-3" data-testid="roles">
			<h2 className="font-semibold">Sides</h2>

			{teams.map((team) => {
				const role = roleByTeamId.get(team.id) ?? null;
				return (
					<div
						className="flex flex-wrap items-center gap-2"
						data-testid={`role-row-${team.name}`}
						key={team.id}
					>
						<TeamBadge team={team} />
						<div className="ml-auto flex gap-2">
							{(["hider", "seeker"] as const).map((option) => (
								<button
									className={`min-h-11 rounded border px-3 text-sm ${role === option ? "border-foreground font-semibold" : ""}`}
									data-testid={`${option}-${team.name}`}
									disabled={!amHost || !roundId}
									key={option}
									onClick={() => set(team.id, role === option ? null : option)}
									type="button"
								>
									{option}
								</button>
							))}
						</div>
					</div>
				);
			})}

			<BalanceAdvice roleByTeamId={roleByTeamId} teams={teams} />
		</section>
	);
}

/**
 * **Balance is displayed, not enforced.** A lobby with no hider team gets a
 * line and nothing more — M5 owns the ready check, and even that will warn
 * rather than block. m1-spec §3.
 */
function BalanceAdvice({
	teams,
	roleByTeamId,
}: {
	teams: readonly LobbyTeam[];
	roleByTeamId: ReadonlyMap<string, TeamRole>;
}) {
	const roles = teams.map((team) => roleByTeamId.get(team.id) ?? null);
	const notes: string[] = [];

	if (teams.length < 2) notes.push("only one team so far");
	if (teams.length > 0 && !roles.includes("hider"))
		notes.push("no hider team yet");
	if (teams.length > 0 && !roles.includes("seeker"))
		notes.push("no seeker team yet");
	if (roles.includes(null) && teams.length > 1)
		notes.push("some teams have no side");

	if (notes.length === 0) return null;

	return (
		<p className="text-amber-700 text-sm" data-testid="balance-advice">
			{notes.join(" · ")}
		</p>
	);
}
