import { formatBattery } from "./battery";
import { PlayerTeamBadge } from "./player-marker";
import type { MapPlayer } from "./players";
import {
	absoluteTime,
	batteryIsWorthShowing,
	formatAccuracy,
	relativeAge,
} from "./staleness";

interface PlayerSheetProps {
	readonly player: MapPlayer;
	readonly onClose: () => void;
}

/**
 * Tap a marker. m2-spec §12.
 *
 * The one surface where the absolute time appears, because it is the one place
 * somebody has stopped walking to read something. Everywhere else the label is
 * relative, so a player acts on the fact rather than doing the subtraction
 * themselves. m2-spec §5.
 */
export function PlayerSheet({ player, onClose }: PlayerSheetProps) {
	const { fix, ageMs } = player;
	const seenAt =
		fix && ageMs !== null ? absoluteTime(Date.now() - ageMs) : null;

	return (
		<section
			className="absolute inset-x-0 bottom-0 z-10 space-y-2 rounded-t-xl border-t bg-surface p-4 shadow-lg"
			data-testid={`player-sheet-${player.displayName}`}
		>
			<header className="flex items-center gap-3">
				<h2 className="font-semibold text-lg">{player.displayName}</h2>
				<button
					className="ml-auto min-h-11 rounded border px-3"
					data-testid="close-player-sheet"
					onClick={onClose}
					type="button"
				>
					Close
				</button>
			</header>

			<PlayerTeamBadge player={player} />

			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
				<dt>Role</dt>
				<dd>{player.role ?? "not assigned"}</dd>

				<dt>Connection</dt>
				<dd data-testid="sheet-online">
					{player.online ? "online" : "offline"}
				</dd>

				<dt>Last seen</dt>
				<dd data-testid="sheet-last-seen">
					{ageMs === null
						? "no position"
						: `${relativeAge(ageMs)}${seenAt ? ` · ${seenAt}` : ""}`}
				</dd>

				{fix && fix.source !== "unavailable" && (
					<>
						<dt>Accuracy</dt>
						<dd data-testid="sheet-accuracy">
							{formatAccuracy(fix.accuracyMeters)} · {fix.source}
						</dd>
					</>
				)}

				{/*
				 * Present only while it is still a fact about a phone somebody can act
				 * on. A battery level from forty minutes ago is a fact about a phone
				 * that has been running ever since. m2-spec §7.
				 */}
				{batteryIsWorthShowing(player.staleness, player.online) && (
					<>
						<dt>Battery</dt>
						<dd data-testid="sheet-battery">{formatBattery(player.battery)}</dd>
					</>
				)}
			</dl>
		</section>
	);
}
