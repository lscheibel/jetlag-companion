import { useQuery, useZero } from "@rocicorp/zero/react";
import {
	circleRegion,
	normalizeRegion,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { elapsed } from "@zero-lag/rules";
import { type ClientFix, mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Surface } from "@zero-lag/ui/components/surface";
import type { SearchableStop } from "../map/toolkit";
import { useNow } from "../map/use-now";
import { formatZone } from "../setup/game-size";
import { formatHms } from "./round-clock";
import type { MyRole } from "./use-role";
import { ZoneNotice } from "./zone-notice";

interface HidingSheetProps {
	readonly role: MyRole;
	readonly selectedStop: SearchableStop | null;
	readonly radiusMeters: number;
	readonly fix: ClientFix | null;
}

/**
 * The hider's card, for as long as the round runs.
 *
 * Before the whistle it is where a zone gets chosen; after it, the same corner
 * of the screen says which zone that was and — via `ZoneNotice` — when the
 * hider has wandered out of it. Two phases, one card, because to the hider it
 * is one subject.
 */
export function HidingSheet({
	role,
	selectedStop,
	radiusMeters,
	fix,
}: HidingSheetProps) {
	if (role.role !== "hider") return null;
	if (role.roundStatus === "hiding") {
		return (
			<HidingPhaseCard
				fix={fix}
				radiusMeters={radiusMeters}
				role={role}
				selectedStop={selectedStop}
			/>
		);
	}
	if (role.roundStatus === "seeking") {
		return <HiddenCard fix={fix} role={role} selectedStop={selectedStop} />;
	}
	return null;
}

function HidingPhaseCard({
	role,
	selectedStop,
	radiusMeters,
	fix,
}: HidingSheetProps) {
	const zero = useZero();
	const [games] = useQuery(queries.game());
	const [commitments] = useQuery(queries.commitments());
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	// The device's own clock, matching the round bar. See `RoundBar` for why
	// the ephemeral clock offset is not applied to either.
	const now = useNow(1_000);

	const mapConfig = games[0]?.mapConfig;
	const mine = commitments.find(
		(commitment) =>
			commitment.roundId === role.roundId &&
			commitment.hiderTeamId === role.teamId,
	);
	const round = rounds.find((candidate) => candidate.id === role.roundId);
	const remaining =
		round?.status === "hiding" && round.hidingStartedAt !== null
			? Math.max(
					0,
					round.hidingDurationMs -
						elapsed(
							round.hidingStartedAt,
							pauses.filter((pause) => pause.roundId === round.id),
							now,
						),
				)
			: null;
	const timeLabel =
		remaining === null
			? "Hiding"
			: remaining === 0
				? "Hiding time is up"
				: `${formatHms(remaining)} left`;

	function commit() {
		if (!role.roundId || !role.teamId || !mapConfig || !selectedStop) return;
		const zone = regionToMultiPolygon(
			normalizeRegion(
				circleRegion(
					[selectedStop.lng, selectedStop.lat],
					mapConfig.hidingRadiusMeters,
				),
			),
		);
		void zero.mutate(
			mutators.round.commitZone({
				eventId: crypto.randomUUID(),
				commitmentId: mine?.id ?? crypto.randomUUID(),
				roundId: role.roundId,
				hiderTeamId: role.teamId,
				stopId: selectedStop.stopId,
				zone: zone.map((polygon) =>
					polygon.map((ring) =>
						ring.map(([lng, lat]) => [lng, lat] as [number, number]),
					),
				),
			}),
		);
	}

	function uncommit() {
		if (!role.roundId || !role.teamId || !mine) return;
		void zero.mutate(
			mutators.round.uncommitZone({
				eventId: crypto.randomUUID(),
				roundId: role.roundId,
				hiderTeamId: role.teamId,
			}),
		);
	}

	const committedHere = mine?.stopId === selectedStop?.stopId;

	return (
		<Surface
			className="pointer-events-auto w-full px-3 py-2.5"
			data-testid="hiding-sheet"
			raised
		>
			<span className="eyebrow block">Hiding</span>
			<p className="font-medium font-mono text-lg leading-none">{timeLabel}</p>
			{selectedStop ? (
				<div className="mt-2 flex flex-col gap-2">
					<p className="text-sm leading-snug">
						<span className="font-medium">{selectedStop.name}</span>
						<span className="text-ink-dim">
							{" "}
							· {formatZone(radiusMeters)} zone
						</span>
					</p>
					{!selectedStop.insideArea && (
						<p
							className="text-amber-700 text-sm"
							data-testid="hiding-outside-area"
						>
							{selectedStop.name} is outside the game area.
						</p>
					)}
					<ZoneNotice fix={fix} role={role} />
					{committedHere ? (
						<ActionButton
							data-testid="uncommit-zone"
							onClick={uncommit}
							size="compact"
							tone="secondary"
						>
							Leave this zone
						</ActionButton>
					) : (
						<ActionButton
							data-testid="commit-zone"
							disabled={!role.roundId}
							onClick={commit}
							size="compact"
						>
							{mine ? "Change" : "Hide here"}
						</ActionButton>
					)}
				</div>
			) : (
				<div className="mt-2 flex flex-col gap-2">
					<p className="text-ink-dim text-sm leading-snug">
						Tap a station to hide there.
					</p>
					<ZoneNotice fix={fix} role={role} />
				</div>
			)}
		</Surface>
	);
}

/**
 * Read-only by construction: `commitZone` refuses once the round is seeking,
 * so there is nothing to offer here beyond the zone itself.
 *
 * The station is named rather than measured. A commitment materialises its
 * zone at commit time, so the hiding radius the game carries now
 * is not necessarily the one this zone was cut with, and printing it would be
 * a guess dressed as a fact.
 */
function HiddenCard({
	role,
	selectedStop,
	fix,
}: Omit<HidingSheetProps, "radiusMeters">) {
	const [commitments] = useQuery(queries.commitments());
	const mine = commitments.find(
		(commitment) =>
			commitment.roundId === role.roundId &&
			commitment.hiderTeamId === role.teamId,
	);

	if (!mine) return null;

	return (
		<Surface
			className="pointer-events-auto w-full px-3 py-2.5"
			data-testid="hiding-sheet"
			raised
		>
			<span className="eyebrow block">Your zone</span>
			{selectedStop && (
				<p className="font-medium text-lg leading-none">{selectedStop.name}</p>
			)}
			<ZoneNotice className="mt-2" fix={fix} role={role} />
		</Surface>
	);
}
