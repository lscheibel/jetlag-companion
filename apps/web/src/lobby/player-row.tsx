import { useState } from "react";
import { useGameShell } from "../game/shell";
import { useLobbyActions } from "./actions";

export interface LobbyPlayer {
	readonly id: string;
	readonly displayName: string;
	readonly isHost: boolean;
}

interface PlayerRowProps {
	player: LobbyPlayer;
	isMe: boolean;
	amHost: boolean;
}

/**
 * One person in the lobby: who they are, whether their phone is with us, and
 * whichever of the two controls applies — the host hat is your own business,
 * and removing somebody is the host's.
 */
export function PlayerRow({ player, isMe, amHost }: PlayerRowProps) {
	const { ephemeral } = useGameShell();
	const { removePlayer, claimHost, releaseHost } = useLobbyActions();

	// Presence carries every player in the game, always — what it withholds is
	// where they are. m1-spec §9.
	const online = ephemeral.entries.some(
		(entry) => entry.playerId === player.id,
	);

	return (
		<li
			className="flex min-h-11 items-center gap-2"
			data-testid={`player-${player.displayName}`}
		>
			{/* Never colour alone: the dot is decoration and the word is the fact. */}
			<span
				aria-hidden
				className={`size-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-neutral-400"}`}
			/>
			<span className="sr-only" data-testid={`online-${player.displayName}`}>
				{online ? "online" : "offline"}
			</span>
			<PlayerName canRename={isMe || amHost} isMe={isMe} player={player} />
			{player.isHost && (
				<span
					className="rounded border px-1 text-xs"
					data-testid={`host-badge-${player.displayName}`}
				>
					host
				</span>
			)}

			{isMe ? (
				<button
					className="ml-auto min-h-11 rounded border px-2 text-xs"
					data-testid={player.isHost ? "release-host" : "claim-host"}
					onClick={player.isHost ? releaseHost : claimHost}
					type="button"
				>
					{player.isHost ? "Step down" : "Be host"}
				</button>
			) : (
				amHost && (
					<button
						className="ml-auto min-h-11 rounded border px-2 text-xs"
						data-testid={`remove-${player.displayName}`}
						onClick={() => removePlayer(player.id)}
						type="button"
					>
						Remove
					</button>
				)
			)}
		</li>
	);
}

/**
 * A name that turns into a field when you tap it. Renaming yourself is always
 * allowed; renaming somebody else is a host action, and the same control does
 * both rather than growing a second one.
 */
function PlayerName({
	player,
	isMe,
	canRename,
}: {
	player: LobbyPlayer;
	isMe: boolean;
	canRename: boolean;
}) {
	const { renamePlayer } = useLobbyActions();
	const [draft, setDraft] = useState<string | null>(null);

	if (draft === null) {
		return (
			<button
				className="min-h-11 text-left"
				data-testid={`rename-${player.displayName}`}
				disabled={!canRename}
				onClick={() => setDraft(player.displayName)}
				type="button"
			>
				{player.displayName}
				{isMe ? " (you)" : ""}
			</button>
		);
	}

	function commit() {
		const name = draft?.trim() ?? "";
		if (name.length > 0 && name !== player.displayName) {
			renamePlayer(name, isMe ? undefined : player.id);
		}
		setDraft(null);
	}

	return (
		<input
			aria-label="Display name"
			className="min-h-11 flex-1 rounded border px-2"
			data-testid={`rename-input-${player.displayName}`}
			onBlur={commit}
			// The field exists only because the player just tapped the name, so the
			// caret belongs in it. A ref callback rather than `autoFocus`, which
			// steals focus on mount wherever the element happens to appear.
			ref={(element) => element?.focus()}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") commit();
				if (event.key === "Escape") setDraft(null);
			}}
			value={draft}
		/>
	);
}
