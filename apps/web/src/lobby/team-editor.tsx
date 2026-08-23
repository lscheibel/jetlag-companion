import type { TeamIdentity } from "@zero-lag/ui/components/team-badge";
import { useState } from "react";
import { useLobbyActions } from "./actions";
import { TEAM_COLORS, TEAM_EMOJI } from "./palette";

interface TeamEditorProps {
	teamId: string;
	team: TeamIdentity;
	/** Every team in the game, including this one, so the picker can grey out duplicates. */
	teams: readonly (TeamIdentity & { id: string })[];
	onDone(): void;
}

/**
 * A team's own members edit its name, colour and emoji. m1-spec §4.
 *
 * Swatches already used in this game are shown as taken and cannot be picked —
 * duplicates are prevented here rather than by the mutator, because a duplicate
 * colour is ugly rather than broken and refusing it would be this app's first
 * refusal of a harmless action.
 */
export function TeamEditor({ teamId, team, teams, onDone }: TeamEditorProps) {
	const { updateTeam } = useLobbyActions();
	const [name, setName] = useState(team.name);

	const others = teams.filter((other) => other.id !== teamId);
	const takenColors = new Set(others.map((other) => other.color));
	const takenEmoji = new Set(others.map((other) => other.emoji));

	function commitName() {
		const next = name.trim();
		if (next.length > 0 && next !== team.name)
			updateTeam(teamId, { name: next });
	}

	return (
		<div className="space-y-3 rounded border p-3" data-testid="team-editor">
			<input
				aria-label="Team name"
				className="min-h-11 w-full rounded border px-2"
				data-testid="team-name-input"
				onBlur={commitName}
				onChange={(event) => setName(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") commitName();
				}}
				value={name}
			/>

			<div className="flex flex-wrap gap-2">
				{TEAM_COLORS.map((color) => (
					<button
						aria-label={`Colour ${color}`}
						className={`size-11 rounded-full border-2 ${color === team.color ? "border-ink" : "border-transparent"} disabled:opacity-30`}
						data-testid={`color-${color}`}
						disabled={takenColors.has(color)}
						key={color}
						onClick={() => updateTeam(teamId, { color })}
						style={{ backgroundColor: color }}
						type="button"
					/>
				))}
			</div>

			<div className="flex flex-wrap gap-2">
				{TEAM_EMOJI.map((emoji) => (
					<button
						className={`size-11 rounded border text-xl ${emoji === team.emoji ? "border-ink" : "border-transparent"} disabled:opacity-30`}
						data-testid={`emoji-${emoji}`}
						disabled={takenEmoji.has(emoji)}
						key={emoji}
						onClick={() => updateTeam(teamId, { emoji })}
						type="button"
					>
						{emoji}
					</button>
				))}
			</div>

			<button
				className="min-h-11 w-full rounded border"
				data-testid="team-editor-done"
				onClick={() => {
					commitName();
					onDone();
				}}
				type="button"
			>
				Done
			</button>
		</div>
	);
}
