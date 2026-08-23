import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { MapMarker } from "./map-canvas";
import type { MapPlayer } from "./players";
import { positionLabel, type Staleness } from "./staleness";

/**
 * How old a fix looks, at a glance. m2-spec §5.
 *
 * Colour is never the only channel — the label underneath says the same thing
 * in words, because this is read one-handed in bright sun.
 */
const APPEARANCE: Record<Staleness, string> = {
	fresh: "opacity-100",
	recent: "opacity-80",
	ageing: "opacity-70 saturate-50",
	cold: "opacity-60 grayscale",
	never: "opacity-60 grayscale",
};

interface PlayerMarkerProps {
	readonly player: MapPlayer;
	readonly onSelect: (playerId: string) => void;
}

/**
 * One player, one marker. m2-spec §12.
 *
 * A player with no position has no marker to put anywhere — they appear in the
 * roster panel instead, labelled absent, which is where "in the game, has not
 * opened it" belongs.
 *
 * Markers jump; they do not interpolate. Fan-out is every two seconds, and
 * smoothing between two fixes would paint a position nobody reported — the same
 * lie as an inferred heading, in a prettier form. m2-spec §4.
 */
export function PlayerMarker({ player, onSelect }: PlayerMarkerProps) {
	const { fix } = player;
	if (!fix || fix.source === "unavailable") return null;

	return (
		<MapMarker lat={fix.lat} lng={fix.lng}>
			<button
				className={`flex min-h-11 flex-col items-center gap-0.5 ${APPEARANCE[player.staleness]}`}
				data-staleness={player.staleness}
				data-testid={`marker-${player.displayName}`}
				onClick={() => onSelect(player.playerId)}
				type="button"
			>
				<span
					className="size-3 rounded-full border-2 border-white shadow"
					style={{ backgroundColor: player.team?.color ?? "#6b7280" }}
				/>
				<span className="rounded bg-white/90 px-1.5 py-0.5 text-xs shadow">
					<span className="font-semibold">{player.displayName}</span>
					{player.team && <span aria-hidden> {player.team.emoji}</span>}
				</span>
				<span
					className="rounded bg-white/80 px-1 text-[10px] text-ink-dim"
					data-testid={`marker-age-${player.displayName}`}
				>
					{positionLabel({
						ageMs: player.ageMs,
						accuracyMeters: fix.accuracyMeters,
					})}
					{!player.online && " · offline"}
				</span>
			</button>
		</MapMarker>
	);
}

/**
 * The same player, in a list, so that a team is rendered by the one component
 * that renders teams. m1-spec §4 — and this is the screen that promise was
 * written for.
 */
export function PlayerTeamBadge({ player }: { player: MapPlayer }) {
	if (!player.team) return <span>No team</span>;
	return <TeamBadge team={player.team} />;
}
