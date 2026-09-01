import { useQuery, useZero } from "@rocicorp/zero/react";
import {
	circleRegion,
	normalizeRegion,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { elapsed } from "@zero-lag/rules";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Surface } from "@zero-lag/ui/components/surface";
import type { SearchableStop } from "../map/toolkit";
import { useNow } from "../map/use-now";
import { formatZone } from "../setup/game-size";
import { formatHms } from "./round-clock";
import type { MyRole } from "./use-role";

interface HidingSheetProps {
	readonly role: MyRole;
	readonly selectedStop: SearchableStop | null;
	readonly radiusMeters: number;
}

export function HidingSheet({
	role,
	selectedStop,
	radiusMeters,
}: HidingSheetProps) {
	const zero = useZero();
	const [games] = useQuery(queries.game());
	const [commitments] = useQuery(queries.commitments());
	const [rounds] = useQuery(queries.rounds());
	const [pauses] = useQuery(queries.roundPauses());
	// The device's own clock, matching the round bar. See `RoundBar` for why
	// the ephemeral clock offset is not applied to either.
	const now = useNow(1_000);

	if (role.role !== "hider" || role.roundStatus !== "hiding") return null;

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
				<p className="mt-2 text-ink-dim text-sm leading-snug">
					Tap a station to hide there.
				</p>
			)}
		</Surface>
	);
}
