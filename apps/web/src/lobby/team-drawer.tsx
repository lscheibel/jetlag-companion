import type { TeamRole } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { ColorPicker, EmojiPicker } from "@zero-lag/ui/components/picker";
import {
	SegmentedControl,
	type SegmentOption,
} from "@zero-lag/ui/components/segmented-control";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { useState } from "react";
import { useLobbyActions } from "./actions";
import type { LobbyTeamView } from "./model";
import { sideWord } from "./model";
import {
	COLOR_OPTIONS,
	EMOJI_OPTIONS,
	suggestIdentity,
	withTaken,
} from "./palette";

/**
 * The empty string is a real state, not a missing default: a new team has no
 * side until somebody gives it one, and it is not in `SIDES`, so the control
 * renders with no segment lit rather than quietly claiming "hiding". m1-spec §9.
 */
type SideChoice = TeamRole | "";

const SIDES: readonly SegmentOption<SideChoice>[] = [
	{ value: "hider", label: "🦊 Hiding" },
	{ value: "seeker", label: "🦉 Seeking" },
];

/**
 * A team is a name, a side and a face. One sheet does both jobs, because
 * creating a team and editing one are the same four questions and the only
 * difference is what the button at the bottom says.
 *
 * Who is *on* the team is deliberately not here. Renaming a team and moving a
 * person between teams have nothing in common except appearing near each other,
 * and the drawer that did both was doing too much. Membership has its own
 * screen, which can show everybody at once — including the people who are on no
 * team yet.
 */

interface TeamDrawerProps {
	/** Null creates a new team; a team edits that one. */
	team: LobbyTeamView | null;
	open: boolean;
	onClose: () => void;
	/** Every team, so a new one picks a face and colour nobody has taken. */
	teams: readonly LobbyTeamView[];
	/** Only a host may set which side a team plays, or remove one. */
	amHost: boolean;
	/** The viewer is on this team, which is what makes it theirs to edit. */
	mine: boolean;
	onJoin: () => void;
	roundId: string | null;
}

export function TeamDrawer({
	team,
	open,
	onClose,
	teams,
	amHost,
	mine,
	onJoin,
	roundId,
}: TeamDrawerProps) {
	const { createTeam, updateTeam, deleteTeam, assignRoles } = useLobbyActions();
	const suggestion = suggestIdentity(teams);
	/**
	 * Who already holds each colour and face, so a square says so instead of
	 * quietly refusing. Derived here rather than stored: the lobby is live, and
	 * a team can take a colour while this sheet is open.
	 */
	const takenColors = new Map(
		teams
			.filter((other) => other.id !== team?.id)
			.map((o) => [o.color, o.name]),
	);
	const takenEmoji = new Map(
		teams
			.filter((other) => other.id !== team?.id)
			.map((o) => [o.emoji, o.name]),
	);

	const [draft, setDraft] = useState<{
		name: string;
		color: string;
		emoji: string;
		role: TeamRole | null;
	} | null>(null);

	/**
	 * A new team starts with **no side**, and that is not a missing default.
	 *
	 * A side is what the presence filter reads: a hider receives every position
	 * in the game. Preselecting "hiding" would make each new team a hider team
	 * for as long as it takes the host to notice, and every phone on it would be
	 * sent the other side's coordinates in the meantime. m1-spec §9.
	 *
	 * The board says so plainly instead — a team with no side sits under "No side
	 * yet", and the lobby refuses to start until both sides exist.
	 */
	/**
	 * How a team presents itself is the team's business. `team.update` refuses
	 * anybody who is not on it — a host included — so the fields are read-only
	 * rather than editable-and-then-refused, and what a stranger gets instead is
	 * the one thing they can actually do: join. m1-spec §4.
	 */
	const editable = team === null || mine;

	const value = draft ?? {
		name: team?.name ?? "",
		color: team?.color ?? suggestion.color,
		emoji: team?.emoji ?? suggestion.emoji,
		role: team?.role ?? null,
	};
	const patch = (change: Partial<typeof value>) =>
		setDraft({ ...value, ...change });

	const name = value.name.trim();

	function close() {
		setDraft(null);
		onClose();
	}

	/**
	 * The side is written to the round rather than to the team, because role is
	 * a property of a round and never of a team — which is what lets M5 swap
	 * sides between rounds without touching a single team row. The event carries
	 * the full assignment every time. m1-spec §3, §10.
	 */
	function saveSide(teamId: string, role: TeamRole) {
		if (!roundId) return;
		const next = teams.flatMap((other) => {
			const side = other.id === teamId ? role : other.role;
			return side ? [{ teamId: other.id, role: side }] : [];
		});
		if (!next.some((entry) => entry.teamId === teamId)) {
			next.push({ teamId, role });
		}
		assignRoles(roundId, next);
	}

	function submit() {
		if (editable && name.length === 0) return;
		if (team) {
			if (editable) {
				updateTeam(team.id, {
					name,
					color: value.color,
					emoji: value.emoji,
				});
			}
			if (amHost && value.role && value.role !== team.role) {
				saveSide(team.id, value.role);
			}
		} else {
			if (name.length === 0) return;
			const teamId = createTeam({
				name,
				color: value.color,
				emoji: value.emoji,
			});
			// A new team shows a side selected, so it had better have one: the
			// picker is not a decoration that the host has to confirm elsewhere.
			if (amHost && value.role) saveSide(teamId, value.role);
		}
		close();
	}

	return (
		<Sheet
			actions={
				<div className="flex gap-2.5">
					{team && amHost && (
						<ActionButton
							className="flex-1"
							data-testid={`delete-${team.name}`}
							onClick={() => {
								deleteTeam(team.id);
								close();
							}}
							tone="secondary"
						>
							Remove
						</ActionButton>
					)}
					{team && !mine && (
						<ActionButton
							className="flex-1"
							data-testid={`join-${team.name}`}
							onClick={() => {
								onJoin();
								close();
							}}
						>
							Join team
						</ActionButton>
					)}
					{(editable || amHost) && (
						<ActionButton
							className={team && amHost ? "flex-[2]" : "flex-1"}
							data-testid="team-editor-done"
							disabled={editable && name.length === 0}
							onClick={submit}
						>
							{team ? "Save" : "Create team"}
						</ActionButton>
					)}
				</div>
			}
			onClose={close}
			open={open}
			testId="team-editor"
		>
			<div className="flex items-center gap-3">
				<TeamBadge
					team={{
						name: name || "New team",
						color: value.color,
						emoji: value.emoji,
					}}
					variant="mark"
				/>
				<div className="min-w-0 flex-1">
					<div className="font-display font-extrabold text-lg tracking-tight">
						{team ? team.name : "New team"}
					</div>
					<div className="text-ink-dim text-xs">
						{team ? sideWord(team.role) : "A name, a side, a face"}
					</div>
				</div>
			</div>

			<Field
				autoComplete="off"
				data-testid="team-name-input"
				hint={editable ? undefined : "Only the people on a team rename it."}
				label="Name"
				maxLength={40}
				onChange={(event) => patch({ name: event.target.value })}
				readOnly={!editable}
				value={value.name}
			/>

			<div className="flex flex-col gap-1.5">
				<span className="eyebrow">Side</span>
				<SegmentedControl
					className={amHost ? undefined : "pointer-events-none opacity-45"}
					label="Which side this team plays"
					onChange={(role) => {
						if (role) patch({ role });
					}}
					options={SIDES}
					testId="side"
					value={value.role ?? ""}
				/>
			</div>

			<EmojiPicker
				disabled={!editable}
				label="Face"
				onChange={(emoji) => patch({ emoji })}
				options={withTaken(EMOJI_OPTIONS, takenEmoji)}
				value={value.emoji}
			/>

			<ColorPicker
				disabled={!editable}
				label="Colour"
				onChange={(color) => patch({ color })}
				options={withTaken(COLOR_OPTIONS, takenColors)}
				value={value.color}
			/>
		</Sheet>
	);
}
