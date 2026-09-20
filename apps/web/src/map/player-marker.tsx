import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { cn } from "@zero-lag/ui/lib/utils";
import { MapMarker } from "./map-canvas";
import { type MapPlayer, NO_TEAM_COLOR } from "./players";
import { positionLabel, type Staleness } from "./staleness";

/**
 * How old a fix looks, at a glance. m2-spec §5, as redrawn in deck 12 A.
 *
 * Staleness is a shape before it is a colour: a solid rim, then a dashed one,
 * then no fill at all. A fade alone is one channel wearing two coats — it goes
 * first in bright sun, and it says nothing to a reader who does not see the
 * desaturation. The words are still there for anyone who asks for them; they
 * are just not printed on the map any more.
 *
 * Nothing here greys the team out. A hollow pin has one colour left and it is
 * the team's: where somebody was an hour ago is still worth knowing *whose*
 * position it was, and a grayscale filter takes exactly that away.
 */
const RIM: Record<Staleness, string> = {
	fresh: "border-surface",
	recent: "border-surface opacity-90",
	ageing: "border-stale border-dashed opacity-90",
	cold: "border-dashed opacity-75",
	never: "border-dashed opacity-75",
};

/** Past this the pin is an outline: a place somebody was, not a place they are. */
function isHollow(staleness: Staleness): boolean {
	return staleness === "cold" || staleness === "never";
}

/** The letter on the corner disc, from the name as it is actually written. */
function initialOf(displayName: string): string {
	return [...displayName][0]?.toUpperCase() ?? "?";
}

/**
 * Everything the marker used to print, in the order somebody would say it.
 *
 * Nothing on the pin is text, so this is the whole of what a screen reader —
 * and the marker's accessible name — has to work with. Accuracy is deliberately
 * not in it: the label answers *who* and *when*, which is what the pin itself
 * answers to a sighted player, and `±40 m` is a detail the sheet carries for
 * both of them.
 */
function markerLabel(player: MapPlayer): string {
	return [
		player.displayName,
		player.team?.name ?? "no team",
		positionLabel({ ageMs: player.ageMs, accuracyMeters: null }),
		player.online ? null : "offline",
	]
		.filter((part) => part !== null)
		.join(" · ");
}

interface PlayerMarkerProps {
	readonly player: MapPlayer;
	readonly onSelect: (playerId: string) => void;
}

/**
 * One player, one pin. m2-spec §12, redrawn as deck 12 proposal A.
 *
 * The pin says who, and the map says where; every number the marker used to
 * print — the age, the accuracy, the connection — is a follow-up question, and
 * follow-up questions belong in the sheet a tap away. What is left is one
 * object at 30 px: the team's colour and emoji, the player's initial, and a rim
 * that carries the age as a shape.
 *
 * The team is rendered by `TeamBadge` rather than assembled here out of a
 * coloured dot and a trailing emoji. m1-spec §4 promised one component would
 * render a team everywhere, and this is the screen that promise was written
 * for — at 30 px in bright sun is exactly where colour-alone identification
 * fails.
 *
 * A player with no position has no marker to put anywhere; they belong in a
 * list, which is where "in the game, has not opened it" can be said out loud.
 *
 * Markers jump; they do not interpolate. Fan-out is every two seconds, and
 * smoothing between two fixes would paint a position nobody reported — the same
 * lie as an inferred heading, in a prettier form. m2-spec §4.
 */
export function PlayerMarker({ player, onSelect }: PlayerMarkerProps) {
	const { fix } = player;
	if (!fix || fix.source === "unavailable") return null;

	const hollow = isHollow(player.staleness);
	const rim = RIM[player.staleness];

	return (
		<MapMarker lat={fix.lat} lng={fix.lng}>
			<button
				/*
				 * 30 px of pin inside 44 px of tap, because the thumb reaching for it
				 * belongs to somebody walking. m2-spec §12.
				 */
				className="flex size-tap items-center justify-center"
				data-online={player.online}
				data-staleness={player.staleness}
				data-testid={`marker-${player.displayName}`}
				onClick={() => onSelect(player.playerId)}
				type="button"
			>
				<span
					className="sr-only"
					data-testid={`marker-label-${player.displayName}`}
				>
					{markerLabel(player)}
				</span>

				<span aria-hidden className="relative block">
					{player.team ? (
						<TeamBadge
							className={cn(
								"size-[30px] rounded-full border-[2.5px] text-sm shadow-[0_2px_7px_rgb(2_6_14/0.4)]",
								rim,
							)}
							hollow={hollow}
							team={player.team}
							variant="mark"
						/>
					) : (
						<NoTeamPin
							initial={initialOf(player.displayName)}
							hollow={hollow}
							rim={rim}
						/>
					)}

					{/*
					 * Two teammates are two identical pins without it. It is one letter
					 * and it collides on two Bens — which is what the tap is for.
					 */}
					{player.team && (
						<span
							className={cn(
								"absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full border border-hairline bg-surface font-bold font-mono text-[9px] text-ink leading-none",
								hollow && "opacity-80",
							)}
						>
							{initialOf(player.displayName)}
						</span>
					)}

					{/*
					 * Offline is not a footnote on a timestamp. A phone out of contact
					 * is a different thing from a fix that has gone quiet, so it gets a
					 * mark of its own rather than a third field on a label. m2-spec §6.
					 */}
					{!player.online && (
						<span className="absolute top-1/2 left-1/2 h-[2px] w-[34px] -translate-x-1/2 -translate-y-1/2 rotate-[-38deg] rounded-full bg-offline shadow-[0_0_0_1.5px_var(--surface)]" />
					)}
				</span>
			</button>
		</MapMarker>
	);
}

interface NoTeamPinProps {
	readonly initial: string;
	readonly hollow: boolean;
	readonly rim: string;
}

/**
 * A player on no team still gets a pin, in a neutral grey — with the initial in
 * the middle, because there is no team emoji to put there and an empty disc
 * says nothing at all.
 */
function NoTeamPin({ initial, hollow, rim }: NoTeamPinProps) {
	return (
		<span
			className={cn(
				"grid size-[30px] place-items-center rounded-full border-[2.5px] font-bold font-mono text-[11px] shadow-[0_2px_7px_rgb(2_6_14/0.4)]",
				hollow ? "bg-transparent text-ink-dim" : "text-white",
				rim,
			)}
			style={
				hollow
					? { borderColor: NO_TEAM_COLOR }
					: { backgroundColor: NO_TEAM_COLOR }
			}
		>
			{initial}
		</span>
	);
}
