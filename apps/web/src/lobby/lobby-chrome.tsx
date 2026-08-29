import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { clearSession } from "../session";
import { editorHomePath } from "../setup/area/tool-nav";
import { useLobbyActions } from "./actions";
import { InviteSheet } from "./invite-sheet";
import { LobbyHeader } from "./lobby-header";
import { LobbyMenu } from "./lobby-menu";
import { useLobby } from "./use-lobby";

/**
 * The lobby's own header, and the two sheets that belong to it, on any screen
 * that is a place in the game rather than a step.
 */

export function LobbyChrome({
	status,
	controls = true,
}: {
	readonly status?: ReactNode;
	/** Invite and menu. Off on the map — those belong to the lobby. */
	readonly controls?: boolean;
}) {
	const lobby = useLobby();
	const { session } = useGameShell();
	const navigate = useNavigate();
	const { claimHost, leaveGame } = useLobbyActions();
	const [overlay, setOverlay] = useState<"none" | "invite" | "menu">("none");
	const [leaving, setLeaving] = useState(false);

	function leave() {
		setLeaving(true);
		void leaveGame().then(() => {
			clearSession();
			void navigate("/");
		});
	}

	return (
		<>
			<LobbyHeader
				onInvite={controls ? () => setOverlay("invite") : undefined}
				onLobby={
					controls ? undefined : () => void navigate(`/g/${session.code}`)
				}
				onMap={
					controls ? () => void navigate(`/g/${session.code}/map`) : undefined
				}
				onMenu={controls ? () => setOverlay("menu") : undefined}
				status={status}
			/>
			{controls && (
				<>
					<LobbyMenu
						amHost={lobby.amHost}
						leaving={leaving}
						onClose={() => setOverlay("none")}
						onGameArea={() =>
							void navigate(editorHomePath(session.code, "lobby"))
						}
						onHidingZone={() =>
							void navigate(`/g/${session.code}/setup/size?from=lobby`)
						}
						onTeams={() =>
							void navigate(`/g/${session.code}/setup/teams?from=lobby`)
						}
						onClaimHost={() => {
							claimHost();
							setOverlay("none");
						}}
						onLeave={leave}
						onTransit={() =>
							void navigate(`/g/${session.code}/setup/transit?from=lobby`)
						}
						open={overlay === "menu"}
					/>
					<InviteSheet
						code={session.code}
						onClose={() => setOverlay("none")}
						open={overlay === "invite"}
					/>
				</>
			)}
		</>
	);
}
