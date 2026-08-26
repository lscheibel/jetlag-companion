import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { IconButton } from "@zero-lag/ui/components/icon-button";
import { ScreenHeader } from "@zero-lag/ui/components/screen";
import type { ReactNode } from "react";

/**
 * Which round this is, and which phase it is in. The other place in the game
 * sits on the leading edge; invite and menu on the trailing.
 *
 * The join code is **not** in the header. It is something you give away once,
 * not a badge to wear for four hours — so it lives behind the share control,
 * with the QR first because that is how it actually gets used.
 */

/** Square icon ActionButton: the press edge, not a drop shadow. */
const SQUARE_ACTION =
	"shrink-0 [&_.zl-press-face]:size-tap [&_.zl-press-face]:items-center [&_.zl-press-face]:justify-center [&_.zl-press-face]:px-0";

interface LobbyHeaderProps {
	onInvite?: () => void;
	onMenu?: () => void;
	/** The map, from the lobby. */
	onMap?: () => void;
	/** The lobby, from the map. */
	onLobby?: () => void;
	/** Clock — map only, on the trailing edge. */
	status?: ReactNode;
}

export function LobbyHeader({
	onInvite,
	onMenu,
	onMap,
	onLobby,
	status,
}: LobbyHeaderProps) {
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	const round =
		[...rounds].reverse().find((candidate) => candidate.status !== "ended") ??
		rounds.at(-1);
	const phase = round?.status ?? "pending";
	const paused =
		round !== undefined &&
		pauses.some(
			(pause) => pause.roundId === round.id && pause.endedAt === null,
		);
	const place = onMap
		? {
				label: "Map",
				icon: "map-trifold" as const,
				onClick: onMap,
				testId: "open-map",
			}
		: onLobby
			? {
					label: "Lobby",
					icon: "users-three" as const,
					onClick: onLobby,
					testId: "open-lobby",
				}
			: null;

	return (
		<ScreenHeader
			eyebrow={round ? `Round ${round.ordinal}` : "Round"}
			leading={
				place ? (
					<PlaceAction
						icon={place.icon}
						label={place.label}
						onClick={place.onClick}
						testId={place.testId}
					/>
				) : undefined
			}
			title={
				<>
					<span aria-hidden="true" className="font-extrabold">
						{phaseLabel(phase)}
					</span>
					<span className="sr-only" data-testid="lobby-round-phase">
						{paused ? `${phase} paused` : phase}
					</span>
				</>
			}
			trailing={
				(status || onInvite || onMenu) && (
					<div className="flex shrink-0 items-center gap-1.5">
						{status}
						{onInvite && (
							<IconButton
								aria-label="Ask people in"
								onClick={onInvite}
								testId="show-qr"
							>
								<Icon name="share-network" size="sm" />
							</IconButton>
						)}
						{onMenu && (
							<IconButton
								aria-label="More"
								onClick={onMenu}
								testId="lobby-menu"
							>
								<Icon name="dots-three" size="md" />
							</IconButton>
						)}
					</div>
				)
			}
		/>
	);
}

function PlaceAction({
	label,
	icon,
	onClick,
	testId,
}: {
	label: string;
	icon: IconName;
	onClick: () => void;
	testId: string;
}) {
	return (
		<ActionButton
			aria-label={label}
			className={SQUARE_ACTION}
			data-testid={testId}
			inline
			onClick={onClick}
			size="compact"
			tone="secondary"
		>
			<Icon name={icon} size="sm" />
		</ActionButton>
	);
}

function phaseLabel(status: string): string {
	switch (status) {
		case "hiding":
			return "Hiding";
		case "seeking":
			return "Seeking";
		case "ended":
			return "Ended";
		default:
			return "Lobby";
	}
}
