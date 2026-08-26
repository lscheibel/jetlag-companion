import { useZero } from "@rocicorp/zero/react";
import type { TeamRole } from "@zero-lag/schema";
import { mutators } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { HoldButton } from "@zero-lag/ui/components/hold-button";
import { Notice } from "@zero-lag/ui/components/notice";
import {
	Screen,
	ScreenActions,
	ScreenBody,
} from "@zero-lag/ui/components/screen";
import { listContainer } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import {
	LobbyProvider,
	useLobbyActions,
	useLobbyRejection,
} from "../lobby/actions";
import { BlockerCards } from "../lobby/blockers";
import { hasSeenBriefing } from "../lobby/briefing-seen";
import { HostBanner } from "../lobby/host-banner";
import { InviteSheet } from "../lobby/invite-sheet";
import { LobbyHeader } from "../lobby/lobby-header";
import { LobbyMenu } from "../lobby/lobby-menu";
import {
	type Blocker,
	canStart,
	type LobbyPerson,
	type LobbyTeamView,
	readyCount,
	startBlockers,
	startRemarks,
} from "../lobby/model";
import { HiderResult } from "../lobby/outcome-list";
import { PersonRow } from "../lobby/person-row";
import { PickTeamSheet } from "../lobby/pick-team-sheet";
import { EndRoundAction, PlayMapAction } from "../lobby/play-map-cta";
import { PlayerSheet } from "../lobby/player-sheet";
import { RoundControls } from "../lobby/round-controls";
import { StartSeekingAction } from "../lobby/start-seeking";
import { TeamDrawer } from "../lobby/team-drawer";
import { TeamRow } from "../lobby/team-row";
import { useLobby } from "../lobby/use-lobby";
import { rejectionMessage } from "../lobby/use-rejections";
import { clearSession } from "../session";
import { editorHomePath } from "../setup/area/tool-nav";

/**
 * The lobby: everybody in the game, under the team they are on.
 *
 * **One screen, not two.** The host is a player like everybody else who
 * additionally has a game to set up, and giving them a separate board meant
 * asking one group of friends to read two different pictures of the same room.
 * So there is one list — the people on no team at the top, where they are the
 * thing in the way, then the teams grouped by the side they play. A tap on a
 * person opens their sheet: that is where a name is changed, and where a host
 * moves or removes. The board itself stays a picture of the room.
 *
 * It deliberately does **not** track position. Identity, online-ness and
 * battery are all it subscribes to; the location watch belongs to a round that
 * has started, and a lobby that quietly drains 8% of everyone's battery while
 * the group argues about team names is a bad first impression. m1-spec §9.
 */
export default function LobbyRoute() {
	return (
		<LobbyProvider>
			<Lobby />
		</LobbyProvider>
	);
}

/** What is open over the board. One at a time, and none of them is a route. */
type Overlay =
	| { kind: "none" }
	| { kind: "invite" }
	| { kind: "menu" }
	| { kind: "team"; team: LobbyTeamView | null }
	| { kind: "player"; person: LobbyPerson }
	| { kind: "move"; person: LobbyPerson };

function Lobby() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const zero = useZero();
	const lobby = useLobby();
	const { claimHost, joinTeam, leaveGame, leaveTeam, setReady } =
		useLobbyActions();
	const { rejection, dismiss } = useLobbyRejection();
	const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
	const [leaving, setLeaving] = useState(false);

	const blockers = startBlockers(lobby.teams, lobby.people);
	const remarks = startRemarks(lobby.teams);
	const host = lobby.people.find((person) => person.isHost) ?? null;
	const roundPending = lobby.round?.status === "pending";
	const seenBriefing = hasSeenBriefing(session.gameId, session.playerId);
	const { ready, total } = readyCount(lobby.people);
	const iAmReady = lobby.me?.readyAt != null;
	const everybodyIn = total > 0 && canStart(lobby.teams, lobby.people);

	/** The whistle: the hiding countdown starts the moment this lands. */
	function start() {
		if (!lobby.round) return;
		zero.mutate(
			mutators.round.startHiding({
				eventId: crypto.randomUUID(),
				roundId: lobby.round.id,
			}),
		);
	}

	/**
	 * The session is not cleared until the others have been told. Underground
	 * that means the button stays busy until the signal comes back, which is the
	 * truth: you have not left a lobby that does not know you have.
	 */
	function leave() {
		setLeaving(true);
		void leaveGame().then(() => {
			clearSession();
			void navigate("/");
		});
	}

	/**
	 * Each block is a tap to the thing that fixes it. Both of the ones left are
	 * about teams, so both land in the drawer — a game with no teams needs one
	 * made, and a board with one side needs a side set.
	 */
	function fix(blocker: Blocker) {
		if (blocker.kind === "no-teams") {
			setOverlay({ kind: "team", team: null });
			return;
		}
		const team = lobby.teams.find((value) => value.role === null);
		setOverlay({ kind: "team", team: team ?? lobby.teams[0] ?? null });
	}

	/** Putting somebody on a team — themselves, or because a host said so. */
	function put(person: LobbyPerson, team: LobbyTeamView) {
		if (person.teamId) leaveTeam(person.teamId);
		joinTeam(team.id, person.id === session.playerId ? undefined : person.id);
		setOverlay({ kind: "none" });
	}

	function move(team: LobbyTeamView) {
		if (overlay.kind !== "move") return;
		put(overlay.person, team);
	}

	const personRow = (value: LobbyPerson, loose = false) => (
		<PersonRow
			isMe={value.id === session.playerId}
			key={value.id}
			loose={loose}
			onOpen={() => setOverlay({ kind: "player", person: value })}
			person={value}
			showReady={roundPending}
		/>
	);

	const selectedPerson =
		overlay.kind === "player" || overlay.kind === "move"
			? (lobby.people.find((person) => person.id === overlay.person.id) ??
				lobby.removed.find((person) => person.id === overlay.person.id) ??
				overlay.person)
			: null;
	const selectedRemoved =
		selectedPerson !== null &&
		lobby.removed.some((person) => person.id === selectedPerson.id);

	const sides: readonly { role: TeamRole | null; label: string }[] = [
		{ role: "hider", label: "Hiders" },
		{ role: "seeker", label: "Seekers" },
		{ role: null, label: "No side yet" },
	];

	return (
		<Screen data-testid="lobby">
			<LobbyHeader
				onInvite={() => setOverlay({ kind: "invite" })}
				onMap={() => void navigate(`/g/${session.code}/map`)}
				onMenu={() => setOverlay({ kind: "menu" })}
			/>

			<ScreenBody className="gap-2">
				<Notice
					onDismiss={dismiss}
					open={rejection !== null}
					testId="rejection-notice"
					title={rejection ? rejectionMessage(rejection) : ""}
					tone="warn"
				/>
				<HostBanner />

				{!roundPending && <RoundControls amHost={lobby.amHost} />}

				<motion.div
					animate="shown"
					className="flex flex-col gap-2"
					initial="hidden"
					variants={listContainer}
				>
					{/* On no team at all: at the top, because that is the thing in the
					    way of starting rather than a footnote under the teams. */}
					{lobby.unassigned.length > 0 && (
						<section className="flex flex-col gap-1" data-testid="unassigned">
							<SectionHead
								label="Not on a team"
								tally={String(lobby.unassigned.length)}
								warn
							/>
							{lobby.unassigned.map((value) => personRow(value, true))}
						</section>
					)}

					{lobby.amHost && roundPending && (
						<div className="flex justify-end pt-1.5">
							<button
								aria-label="New team"
								className={cn(
									"grid size-7 place-items-center rounded-control border border-hairline-strong",
									"font-semibold text-ink text-sm",
									"transition-transform duration-[--dur-press] ease-[--ease-pop] hover:-translate-y-0.5 active:scale-90",
								)}
								data-testid="create-team"
								onClick={() => setOverlay({ kind: "team", team: null })}
								type="button"
							>
								+
							</button>
						</div>
					)}

					{sides.map(({ role, label }) => {
						const group = lobby.teams.filter((team) => team.role === role);
						if (group.length === 0) return null;
						return (
							<section
								className="flex flex-col gap-1.5"
								data-testid={`side-${label.toLowerCase().replace(/\s+/g, "-")}`}
								key={label}
							>
								<SectionHead
									label={label}
									tally={`${group.length} team${group.length === 1 ? "" : "s"}`}
									thin
								/>
								{group.map((team) => (
									<TeamRow
										key={team.id}
										mine={team.id === lobby.myTeam?.id}
										onOpen={() => setOverlay({ kind: "team", team })}
										result={
											<HiderResult
												teamId={team.id}
												teamName={team.name}
												token={session.token}
											/>
										}
										team={team}
									>
										{team.members.map((value) => personRow(value))}
									</TeamRow>
								))}
							</section>
						);
					})}

					{lobby.removed.length > 0 && (
						<section className="flex flex-col gap-1" data-testid="removed">
							<SectionHead label="Removed" tally="" />
							{lobby.removed.map((value) => (
								<PersonRow
									isMe={false}
									key={value.id}
									onOpen={() => setOverlay({ kind: "player", person: value })}
									person={value}
									removed
								/>
							))}
						</section>
					)}
				</motion.div>

				<div className="flex-1" />

				{remarks.map((remark) => (
					<p
						className="px-1 text-ink-dim text-xs leading-snug"
						data-testid="lobby-remark"
						key={remark}
					>
						{remark}
					</p>
				))}
			</ScreenBody>

			{roundPending && (
				<ScreenActions note={waitingNote(lobby, host)}>
					{blockers.length > 0 && (
						<BlockerCards
							actionable={lobby.amHost}
							blockers={blockers}
							onFix={fix}
						/>
					)}

					{/*
					 * Ready is said here, on the board, rather than on a screen of its
					 * own: everybody's tick is already visible beside their name, so a
					 * second screen listing the same ticks was a second place to look at
					 * the same fact. Saying it without having seen the area is still not
					 * a thing worth allowing, so the button reads the briefing first.
					 */}
					{seenBriefing ? (
						<ActionButton
							beacon={!iAmReady}
							data-testid={iAmReady ? "unready" : "mark-ready"}
							disabled={!lobby.myTeam}
							hint={`${ready}/${total}`}
							onClick={() => setReady(!iAmReady)}
							tone={iAmReady ? "secondary" : "primary"}
						>
							{iAmReady ? "Actually, not yet" : "I'm ready"}
						</ActionButton>
					) : (
						<ActionButton
							beacon
							data-testid="read-briefing"
							disabled={!lobby.myTeam}
							onClick={() => void navigate(`/g/${session.code}/briefing`)}
						>
							Read the briefing
						</ActionButton>
					)}

					{/*
					 * The whistle, and only the host has it. Held rather than tapped —
					 * the fill is the confirmation, and letting go early is a friendlier
					 * undo than a dialog asking whether you meant it.
					 */}
					{lobby.amHost && (
						<HoldButton
							disabled={!everybodyIn}
							onConfirm={start}
							testId="start-hiding"
							tone="live"
						>
							{everybodyIn
								? "Hold to start the game"
								: `Waiting on ${total - ready} of ${total}`}
						</HoldButton>
					)}
				</ScreenActions>
			)}

			<StartSeekingAction />
			<EndRoundAction />
			<PlayMapAction />

			<LobbyMenu
				amHost={lobby.amHost}
				leaving={leaving}
				onBriefing={() => void navigate(`/g/${session.code}/briefing`)}
				onClose={() => setOverlay({ kind: "none" })}
				onGameArea={() => void navigate(editorHomePath(session.code, "lobby"))}
				onHidingZone={() =>
					void navigate(`/g/${session.code}/setup/size?from=lobby`)
				}
				onClaimHost={() => {
					claimHost();
					setOverlay({ kind: "none" });
				}}
				onLeave={leave}
				onTransit={() =>
					void navigate(`/g/${session.code}/setup/transit?from=lobby`)
				}
				open={overlay.kind === "menu"}
			/>

			<InviteSheet
				code={session.code}
				onClose={() => setOverlay({ kind: "none" })}
				open={overlay.kind === "invite"}
			/>

			<TeamDrawer
				amHost={lobby.amHost}
				mine={
					overlay.kind === "team" &&
					overlay.team !== null &&
					overlay.team.id === lobby.myTeam?.id
				}
				onClose={() => setOverlay({ kind: "none" })}
				onJoin={() => {
					if (overlay.kind === "team" && overlay.team && lobby.me) {
						put(lobby.me, overlay.team);
					}
				}}
				open={overlay.kind === "team"}
				roundId={lobby.round?.id ?? null}
				team={overlay.kind === "team" ? overlay.team : null}
				teams={lobby.teams}
			/>

			<PlayerSheet
				amHost={lobby.amHost}
				isMe={selectedPerson !== null && selectedPerson.id === session.playerId}
				onClose={() => setOverlay({ kind: "none" })}
				onMove={() => {
					if (selectedPerson) {
						setOverlay({ kind: "move", person: selectedPerson });
					}
				}}
				open={overlay.kind === "player"}
				person={overlay.kind === "player" ? selectedPerson : null}
				removed={selectedRemoved}
				showReady={roundPending}
			/>

			<PickTeamSheet
				currentTeamId={overlay.kind === "move" ? overlay.person.teamId : null}
				onClose={() =>
					setOverlay(
						overlay.kind === "move"
							? { kind: "player", person: overlay.person }
							: { kind: "none" },
					)
				}
				onPick={move}
				open={overlay.kind === "move"}
				subtitle="Everyone sees it straight away"
				teams={lobby.teams}
				title={
					overlay.kind === "move"
						? overlay.person.id === session.playerId
							? "Which team?"
							: `Put ${overlay.person.displayName} on`
						: ""
				}
			/>
		</Screen>
	);
}

/** Names who is missing, and leaves you out of it: yours is the button. */
function waitingNote(
	lobby: ReturnType<typeof useLobby>,
	host: LobbyPerson | null,
): string {
	const others = lobby.people.filter(
		(person) => person.readyAt === null && person.id !== lobby.me?.id,
	);
	if (others.length === 0) {
		return host
			? `${host.displayName} starts it once everybody is ready.`
			: "Nobody is running this game yet.";
	}
	const names = others.map((person) => person.displayName);
	const last = names.pop();
	return names.length === 0
		? `Still to say yes: ${last}.`
		: `Still to say yes: ${names.join(", ")} and ${last}.`;
}

interface SectionHeadProps {
	label: string;
	tally: string;
	warn?: boolean;
	/** A sub-heading inside a section that already has one. */
	thin?: boolean;
}

function SectionHead({
	label,
	tally,
	warn = false,
	thin = false,
}: SectionHeadProps) {
	return (
		<div className={cn("flex items-center gap-2.5", thin ? "pt-1" : "pt-1.5")}>
			{warn && (
				<span
					aria-hidden
					className="zl-breathe size-1.5 shrink-0 rounded-full bg-stale"
				/>
			)}
			<span
				className={cn(
					"eyebrow",
					warn && "text-stale",
					!thin && !warn && "text-ink",
				)}
			>
				{label}
			</span>
			<span className="h-px flex-1 bg-hairline" />
			{tally && <span className="eyebrow">{tally}</span>}
		</div>
	);
}
