import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { Notice } from "@zero-lag/ui/components/notice";
import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { fadeOnly, listContainer, listItem } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { LobbyProvider, useLobbyRejection } from "../lobby/actions";
import {
	hasBothSides,
	type LobbyTeamView,
	sideWord,
	teamsContinueNote,
} from "../lobby/model";
import { TeamDrawer } from "../lobby/team-drawer";
import { useLobby } from "../lobby/use-lobby";
import { rejectionMessage } from "../lobby/use-rejections";
import { WizardStep } from "../setup/wizard-step";

/**
 * The teams this game will have. People join them in the lobby — this screen
 * is the structure, not the roster.
 */

export default function SetupTeamsRoute() {
	return (
		<LobbyProvider>
			<SetupTeams />
		</LobbyProvider>
	);
}

function SetupTeams() {
	const navigate = useNavigate();
	const location = useLocation();
	const { session } = useGameShell();
	const lobby = useLobby();
	const { rejection, dismiss } = useLobbyRejection();
	const fromLobby =
		new URLSearchParams(location.search).get("from") === "lobby";
	const lobbyPath = `/g/${session.code}`;
	const [sheet, setSheet] = useState<
		{ kind: "closed" } | { kind: "new" } | { kind: "edit"; team: LobbyTeamView }
	>({ kind: "closed" });

	const bothSides = hasBothSides(lobby.teams);

	return (
		<WizardStep
			continueDisabled={!bothSides}
			continueLabel={fromLobby ? "Done" : "Continue"}
			continueTestId="setup-teams-continue"
			eyebrow={fromLobby ? "This game" : undefined}
			note={teamsContinueNote(lobby.teams)}
			onBack={() =>
				void navigate(fromLobby ? lobbyPath : `/g/${session.code}/setup/size`)
			}
			onContinue={() =>
				void navigate(fromLobby ? lobbyPath : `/g/${session.code}/setup/review`)
			}
			showRail={!fromLobby}
			step={4}
			title="Who's playing?"
		>
			<Notice
				onDismiss={dismiss}
				open={rejection !== null}
				testId="rejection-notice"
				title={rejection ? rejectionMessage(rejection) : ""}
				tone="warn"
			/>

			<p
				className="px-1 text-ink-dim text-xs leading-snug"
				data-testid="setup-teams"
			>
				These are the teams this game will have. Names, sides and faces — not
				who is on them.
			</p>

			<motion.div
				animate="shown"
				className="flex flex-col gap-2"
				initial="hidden"
				variants={listContainer}
			>
				{lobby.teams.map((team) => (
					<SetupTeamRow
						key={team.id}
						onOpen={() => setSheet({ kind: "edit", team })}
						team={team}
					/>
				))}
			</motion.div>

			<button
				className={cn(
					"flex min-h-tap items-center justify-center gap-2 rounded-tile border border-hairline-strong border-dashed",
					"text-ink-dim text-sm",
					"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:-translate-y-0.5 active:scale-[0.99]",
				)}
				data-testid="create-team"
				onClick={() => setSheet({ kind: "new" })}
				type="button"
			>
				<Icon name="plus" size="sm" />
				Add a team
			</button>

			<TeamDrawer
				amHost={lobby.amHost}
				mine={sheet.kind === "edit" && sheet.team.id === lobby.myTeam?.id}
				onClose={() => setSheet({ kind: "closed" })}
				open={sheet.kind !== "closed"}
				roundId={lobby.round?.id ?? null}
				team={
					sheet.kind === "edit"
						? (lobby.teams.find((team) => team.id === sheet.team.id) ??
							sheet.team)
						: null
				}
				teams={lobby.teams}
			/>
		</WizardStep>
	);
}

interface SetupTeamRowProps {
	team: LobbyTeamView;
	onOpen: () => void;
}

/** Square icon ActionButton, matching the compact row height. */
const SQUARE_ACTION =
	"shrink-0 [&_.zl-press-face]:size-tap [&_.zl-press-face]:items-center [&_.zl-press-face]:justify-center [&_.zl-press-face]:px-0";

function SetupTeamRow({ team, onOpen }: SetupTeamRowProps) {
	const reduced = useReducedMotion();

	return (
		<motion.div variants={reduced ? fadeOnly : listItem}>
			<div
				className="flex w-full items-center gap-2.5 rounded-tile border border-hairline border-l-[5px] bg-surface px-3 py-2.5"
				data-testid="setup-team-row"
				style={{ borderLeftColor: team.color }}
			>
				<button
					className={cn(
						"flex min-w-0 flex-1 items-center gap-2.5 text-left",
						"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:translate-x-0.5 active:scale-[0.99]",
					)}
					data-testid={`team-${team.name}`}
					onClick={onOpen}
					type="button"
				>
					<TeamBadge team={team} variant="mark" />
					<span className="min-w-0 flex-1">
						<span className="block font-display font-extrabold text-[0.95rem] tracking-tight">
							{team.name}
						</span>
						<span className="text-ink-dim text-xs">{sideWord(team.role)}</span>
					</span>
				</button>
				<ActionButton
					aria-label={`Edit ${team.name}`}
					className={SQUARE_ACTION}
					data-testid={`edit-${team.name}`}
					inline
					onClick={onOpen}
					size="compact"
					tone="quiet"
				>
					<Icon name="pencil-line" size="sm" />
				</ActionButton>
			</div>
		</motion.div>
	);
}
