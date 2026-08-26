import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Chip } from "@zero-lag/ui/components/chip";
import { Field } from "@zero-lag/ui/components/field";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { useGameShell } from "../game/shell";
import { relativeAge } from "../map/staleness";
import { useNow } from "../map/use-now";
import { useLobbyActions } from "./actions";
import type { LobbyPerson } from "./model";

/**
 * A person, opened. The row said who they are; this is where you do something
 * about them.
 *
 * Renaming yourself is always allowed. Renaming somebody else, moving them
 * and removing them are the host's, and they live here rather than as a row of
 * buttons that grew every time a host looked at the board. Last seen is a
 * status, not a control — it is the one fact the row's dot cannot say out
 * loud.
 */

interface PlayerSheetProps {
	person: LobbyPerson | null;
	open: boolean;
	onClose: () => void;
	onMove: () => void;
	amHost: boolean;
	isMe: boolean;
	removed?: boolean;
	showReady?: boolean;
}

export function PlayerSheet({
	person,
	open,
	onClose,
	onMove,
	amHost,
	isMe,
	removed = false,
	showReady = true,
}: PlayerSheetProps) {
	const { ephemeral } = useGameShell();
	const { renamePlayer, removePlayer, readmitPlayer } = useLobbyActions();
	const now = useNow();
	const [draft, setDraft] = useState<string | null>(null);

	const canRename = person !== null && (isMe || amHost) && !removed;
	const name = draft ?? person?.displayName ?? "";

	function close() {
		saveName();
		setDraft(null);
		onClose();
	}

	function saveName() {
		if (!person || !canRename) return;
		const next = name.trim();
		if (next.length > 0 && next !== person.displayName) {
			renamePlayer(next, isMe ? undefined : person.id);
		}
	}

	return (
		<Sheet
			actions={
				person &&
				amHost &&
				(removed ? (
					<ActionButton
						data-testid={`readmit-${person.displayName}`}
						onClick={() => {
							readmitPlayer(person.id);
							close();
						}}
					>
						Let back in
					</ActionButton>
				) : (
					<div className="flex gap-2.5">
						{!isMe && (
							<ActionButton
								className="flex-1"
								data-testid={`remove-${person.displayName}`}
								onClick={() => {
									removePlayer(person.id);
									close();
								}}
								tone="danger"
							>
								Remove
							</ActionButton>
						)}
						<ActionButton
							className={!isMe ? "flex-[2]" : "flex-1"}
							data-testid={`move-${person.displayName}`}
							onClick={() => {
								saveName();
								setDraft(null);
								onMove();
							}}
						>
							{person.teamId === null ? "Put on a team" : "Move"}
						</ActionButton>
					</div>
				))
			}
			onClose={close}
			open={open && person !== null}
			testId="player-sheet"
			title={
				person ? `${person.displayName}${isMe ? " (you)" : ""}` : undefined
			}
		>
			{person && (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Chip
							data-testid={`last-seen-${person.displayName}`}
							dot
							tone={person.online ? "live" : "offline"}
						>
							{lastSeenText(person, ephemeral.entriesArrivedAt, now)}
						</Chip>
						{person.isHost && <Chip>Host</Chip>}
						{showReady && person.readyAt !== null && !removed && (
							<Chip tone="live">Ready</Chip>
						)}
					</div>

					{canRename && (
						<Field
							autoComplete="off"
							data-testid={`rename-input-${person.displayName}`}
							label="Name"
							maxLength={40}
							onBlur={saveName}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									saveName();
									(event.target as HTMLInputElement).blur();
								}
								if (event.key === "Escape") setDraft(null);
							}}
							value={name}
						/>
					)}
				</>
			)}
		</Sheet>
	);
}

function lastSeenText(
	person: LobbyPerson,
	entriesArrivedAt: number,
	now: number,
): string {
	if (person.online) return "Online";
	if (person.lastSeenAgeMs === null) return "Offline";
	const ageMs = person.lastSeenAgeMs + Math.max(0, now - entriesArrivedAt);
	return `Last seen ${relativeAge(ageMs)}`;
}
