import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import type { TeamRole } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Chip } from "@zero-lag/ui/components/chip";
import { Icon } from "@zero-lag/ui/components/icon";
import { Sheet, useHeldValue } from "@zero-lag/ui/components/sheet";
import { TeamBadge } from "@zero-lag/ui/components/team-badge";
import { useState } from "react";
import { batteryGlyph, formatBattery } from "./battery";
import { compassPoint, type Readout, readoutOf } from "./player-readout";
import { type MapPlayer, NO_TEAM_COLOR } from "./players";
import {
	absoluteTime,
	accuracyIsWorthShowing,
	batteryIsWorthShowing,
	formatAccuracy,
	relativeAge,
} from "./staleness";
import { formatCoordinates, formatDistance } from "./toolkit";

/**
 * Tap a marker — anybody's, including your own. m2-spec §12, redrawn as deck
 * 13 proposal A.
 *
 * One card, and you are in it. There used to be two: a table of six labelled
 * rows for somebody else, and a title with two lines of coordinates for
 * yourself — which left the one player who can see everything about themselves
 * holding the poorer card. The differences that are real (no distance from
 * yourself, a compass only this device has, a fix that never round-tripped)
 * are branches here rather than a second component to keep in step.
 *
 * The card leads with one fact at the size of one fact, and everything the
 * table used to label is either a chip or gone. Which fact it leads with is
 * `readoutOf`'s decision and is argued there.
 *
 * This is still the one surface carrying an absolute time, because it is the
 * one place somebody has stopped walking to read something. m2-spec §5.
 */

interface PlayerCardProps {
	readonly player: MapPlayer | null;
	readonly open: boolean;
	readonly onClose: () => void;
	/** This phone's own fix, or null when there is none to measure from. */
	readonly fromYou: LngLat | null;
	/** Compass degrees, or null where there is no compass. Your card only. */
	readonly headingDeg: number | null;
	/** Begin a measurement at this position. */
	readonly onMeasure: (point: LngLat) => void;
	/** Your card only: what is supplying this position, and for how long. */
	readonly onPositionSource: () => void;
}

export function PlayerCard({
	player,
	open,
	onClose,
	fromYou,
	headingDeg,
	onMeasure,
	onPositionSource,
}: PlayerCardProps) {
	const shown = useHeldValue(open, player);
	if (!shown) return null;

	const point = pointOf(shown);
	const readout = readoutOf({
		isSelf: shown.isSelf,
		staleness: shown.staleness,
		ageMs: shown.ageMs,
		point,
		accuracyMeters: shown.fix?.accuracyMeters ?? null,
		fromYou: shown.isSelf ? null : fromYou,
	});

	return (
		<Sheet
			/*
			 * Copy above measure: it is the one action that works at every age,
			 * and the coordinates ride in its hint rather than in a row of their
			 * own — the string is there to be taken, not to be read.
			 */
			actions={
				point ? (
					<>
						<CopyLocation point={point} />
						<ActionButton
							data-testid="card-measure"
							onClick={() => onMeasure(point)}
							size="primary"
						>
							Measure from here
						</ActionButton>
					</>
				) : undefined
			}
			label={shown.displayName}
			onClose={onClose}
			open={open}
			testId="player-card"
		>
			<Header player={shown} />

			<div className="flex items-start gap-2">
				<Headline
					headingDeg={shown.isSelf ? headingDeg : null}
					player={shown}
					readout={readout}
				/>
				{/*
				 * Where this position comes from is a question about two sources
				 * that fail independently, and the locate control already opens the
				 * screen that answers it. One glyph beside the number it is about:
				 * a full-width door for a detour nobody takes twice was the loudest
				 * thing on a card whose point is that one fact is loud.
				 */}
				{shown.isSelf && (
					<button
						aria-label="Where this position comes from"
						className="grid size-tap shrink-0 place-items-center rounded-control text-ink-faint transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90"
						data-testid="card-position-source"
						onClick={onPositionSource}
						type="button"
					>
						<Icon name="info" size="md" />
					</button>
				)}
			</div>

			<Facts fromYou={fromYou} player={shown} readout={readout} />
		</Sheet>
	);
}

/**
 * Who this is, in one row: the team's mark, the name, and the team and side
 * under it. The mark belongs beside the name it identifies — next to the
 * headline it reads as a unit on the number, which is not what it says.
 */
function Header({ player }: { player: MapPlayer }) {
	const side = sideLabel(player.role);
	return (
		<div className="flex items-center gap-3">
			<Mark player={player} />
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2">
					<span className="min-w-0 truncate font-display font-extrabold text-lg tracking-tight">
						{player.displayName}
					</span>
					{player.isSelf && (
						<Chip className="shrink-0" data-testid="card-you">
							You
						</Chip>
					)}
				</p>
				<p className="eyebrow truncate" data-testid="card-affiliation">
					{player.team?.name ?? "No team"}
					{side === null ? null : ` · ${side}`}
				</p>
			</div>
		</div>
	);
}

/**
 * The coordinates as an action rather than as a line of text.
 *
 * The number is in the hint because that is what it is for: something to hand
 * to another app, which is a thing you do to it rather than a thing you read.
 * Where the clipboard is out of reach the text stays selectable and says so,
 * rather than offering a button that cannot do anything.
 */
function CopyLocation({ point }: { point: LngLat }) {
	const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");
	const text = formatCoordinates(point);
	const available = webPlatform.clipboard.capability().available;

	if (!available) {
		return (
			<p className="text-center text-ink-dim text-sm" data-testid="card-copy">
				<span className="num select-all text-ink">{text}</span> — select and
				copy
			</p>
		);
	}

	return (
		<ActionButton
			data-testid="card-copy"
			hint={<span className="num">{text}</span>}
			onClick={() =>
				void webPlatform.clipboard
					.write(text)
					.then((success) => setCopied(success ? "yes" : "no"))
			}
			size="comfortable"
			tone="secondary"
		>
			{copied === "yes"
				? "Copied"
				: copied === "no"
					? "Copy failed"
					: "Copy location"}
		</ActionButton>
	);
}

/** Their position, or null where there has never been one to have. */
function pointOf(player: MapPlayer): LngLat | null {
	const { fix } = player;
	if (!fix || fix.source === "unavailable") return null;
	return [fix.lng, fix.lat];
}

function sideLabel(role: TeamRole | null): string | null {
	if (role === "hider") return "Hiders";
	if (role === "seeker") return "Seekers";
	return null;
}

/**
 * The team tile, drawn hollow once the position is history — the same shape
 * the marker uses at the same age, so the card and the pin agree at a glance.
 */
function Mark({ player }: { player: MapPlayer }) {
	const hollow = player.staleness === "cold" || player.staleness === "never";
	if (!player.team) {
		return (
			<span
				aria-hidden
				className="grid size-11 shrink-0 place-items-center rounded-[11px] font-bold font-mono text-lg text-white"
				style={{ backgroundColor: NO_TEAM_COLOR }}
			>
				{[...player.displayName][0]?.toUpperCase() ?? "?"}
			</span>
		);
	}
	return (
		<TeamBadge hollow={hollow} size="lg" team={player.team} variant="mark" />
	);
}

/**
 * The one fact, at the size of one fact, with its qualifier beside it rather
 * than under a label.
 */
function Headline({
	readout,
	player,
	headingDeg,
}: {
	readout: Readout;
	player: MapPlayer;
	headingDeg: number | null;
}) {
	const { lead, qualifier } = headlineWords(readout, headingDeg);
	return (
		<div className="min-w-0 flex-1">
			<p className="flex flex-wrap items-baseline gap-x-2">
				<span
					className="num font-display font-extrabold text-[1.9rem] leading-none tracking-tight"
					data-testid="card-headline"
				>
					{lead}
				</span>
				{qualifier && <span className="text-ink-dim text-sm">{qualifier}</span>}
			</p>
			<Support player={player} readout={readout} />
		</div>
	);
}

function headlineWords(
	readout: Readout,
	headingDeg: number | null,
): { readonly lead: string; readonly qualifier: string | null } {
	if (readout.kind === "distance") {
		return { lead: formatDistance(readout.meters), qualifier: "from you" };
	}
	if (readout.kind === "age") {
		return { lead: relativeAge(readout.ageMs), qualifier: null };
	}
	if (readout.kind === "accuracy") {
		return {
			lead: formatAccuracy(readout.accuracyMeters) ?? "Located",
			qualifier:
				headingDeg === null ? "accuracy" : `facing ${compassPoint(headingDeg)}`,
		};
	}
	return { lead: "No position", qualifier: null };
}

/**
 * The line under the headline: how current the fact above it is, in words and
 * in a dot, and never in a colour alone.
 */
function Support({ readout, player }: { readout: Readout; player: MapPlayer }) {
	if (readout.kind === "absent") {
		return (
			<p className="mt-1 text-ink-dim text-sm" data-testid="sheet-last-seen">
				In the game, nowhere on the map yet
			</p>
		);
	}

	// Your own card says nothing underneath. The headline is this device's own
	// reading of itself, and there is no freshness question to answer about it.
	if (readout.kind === "accuracy") return null;

	const accuracy = accuracyIsWorthShowing(player.staleness)
		? formatAccuracy(player.fix?.accuracyMeters ?? null)
		: null;

	// Once the headline *is* the age, repeating it underneath says nothing. What
	// the line has left to add is when the silence started.
	if (readout.kind === "age") {
		const seenAt =
			player.ageMs === null ? null : absoluteTime(Date.now() - player.ageMs);
		return (
			<p className="mt-1 flex items-center gap-2 text-ink-dim text-sm">
				<Dot player={player} />
				<span data-testid="sheet-last-seen">
					{player.online ? "Quiet since" : "Offline since"}
					{seenAt === null ? "" : ` ${seenAt}`}
				</span>
			</p>
		);
	}

	return (
		<p className="mt-1 flex items-center gap-2 text-ink-dim text-sm">
			<Dot player={player} />
			<span data-testid="sheet-last-seen">
				{player.online
					? player.staleness === "fresh"
						? "Reporting now"
						: relativeAge(player.ageMs ?? 0)
					: "Offline"}
			</span>
			{accuracy && (
				<span className="num" data-testid="sheet-accuracy">
					· {accuracy}
				</span>
			)}
		</p>
	);
}

function Dot({ player }: { player: MapPlayer }) {
	const live = player.online && player.staleness === "fresh";
	return (
		<span
			aria-hidden
			className={`size-2 shrink-0 rounded-full ${
				live ? "zl-breathe bg-live" : player.online ? "bg-stale" : "bg-offline"
			}`}
		/>
	);
}

/**
 * What the table used to label, as chips: present only while each one is still
 * a fact somebody can act on, and absent rather than placeholdered otherwise.
 * m2-spec §7 — a chip that is not there is the same rule as a row that was not
 * there.
 */
function Facts({
	player,
	readout,
	fromYou,
}: {
	player: MapPlayer;
	readout: Readout;
	fromYou: LngLat | null;
}) {
	const seenAt =
		player.ageMs === null ? null : absoluteTime(Date.now() - player.ageMs);
	const point = pointOf(player);

	/*
	 * The distance the headline gave up when it dropped to the age. It is still
	 * worth saying — it was true once — but as a sentence about the past rather
	 * than as a number to walk towards.
	 */
	const wasAway =
		readout.kind === "age" && fromYou && point
			? formatDistance(distanceMeters(fromYou, point))
			: null;

	const worthShowing = batteryIsWorthShowing(player.staleness, player.online);
	const battery = worthShowing ? formatBattery(player.battery) : null;
	const batteryIcon = worthShowing ? batteryGlyph(player.battery) : null;

	if (!seenAt && !battery && !wasAway) return null;

	return (
		<div className="flex flex-col gap-2">
			{wasAway && (
				<p className="text-ink-faint text-sm" data-testid="card-was-away">
					They were <span className="num text-ink-dim">{wasAway}</span> away
					then.
				</p>
			)}
			{(seenAt || battery) && (
				<div className="flex flex-wrap gap-2">
					{seenAt && (
						<Chip
							data-testid="card-seen-at"
							icon={<Icon name="clock" size="xs" />}
						>
							{player.isSelf ? "read" : "seen"} {seenAt}
						</Chip>
					)}
					{battery && (
						<Chip
							data-testid="sheet-battery"
							icon={batteryIcon && <Icon name={batteryIcon} size="xs" />}
						>
							{battery}
						</Chip>
					)}
				</div>
			)}
		</div>
	);
}
