import { useQuery, useZero } from "@rocicorp/zero/react";
import { nearestStationMeters } from "@zero-lag/catalog";
import {
	circleRegion,
	normalizeRegion,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import type { MyRole } from "./use-role";

interface HidingSheetProps {
	role: MyRole;
}

export function HidingSheet({ role }: HidingSheetProps) {
	const zero = useZero();
	const [games] = useQuery(queries.game());
	const [mapStops] = useQuery(queries.mapStops());
	const [commitments] = useQuery(queries.commitments());
	const [stopId, setStopId] = useState("");

	if (role.role !== "hider" || role.roundStatus !== "hiding") return null;

	const mapConfig = games[0]?.mapConfig;
	const choices = [...mapStops].sort(
		(a, b) =>
			Number(b.insideArea) - Number(a.insideArea) ||
			a.name.localeCompare(b.name, "de"),
	);
	const selectedId = stopId || (choices[0]?.stopId ?? "");
	const selected = choices.find((stop) => stop.stopId === selectedId);
	const mine = commitments.find(
		(commitment) =>
			commitment.roundId === role.roundId &&
			commitment.hiderTeamId === role.teamId,
	);
	const nearestMeters = selected
		? nearestStationMeters([selected.lng, selected.lat], mapStops)
		: Number.POSITIVE_INFINITY;
	const farFromStation =
		mapConfig !== undefined && nearestMeters > mapConfig.hidingRadiusMeters;

	function commit() {
		if (!role.roundId || !role.teamId || !mapConfig || !selected) return;
		const zone = regionToMultiPolygon(
			normalizeRegion(
				circleRegion(
					[selected.lng, selected.lat],
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
				stopId: selected.stopId,
				zone: zone.map((polygon) =>
					polygon.map((ring) =>
						ring.map(([lng, lat]) => [lng, lat] as [number, number]),
					),
				),
			}),
		);
	}

	return (
		<section
			className="space-y-2 rounded-xl border bg-background/95 p-3 shadow-lg"
			data-testid="hiding-sheet"
		>
			<h2 className="font-medium">Choose your hiding station</h2>
			<div className="pointer-events-auto flex gap-2">
				<select
					className="min-h-11 min-w-0 flex-1 rounded border bg-background px-2"
					data-testid="hiding-stop"
					onChange={(event) => setStopId(event.target.value)}
					value={selectedId}
				>
					{choices.map((stop) => (
						<option key={stop.stopId} value={stop.stopId}>
							{stop.name}
							{stop.insideArea ? "" : " · outside the area"}
						</option>
					))}
				</select>
				<button
					className="min-h-11 rounded border px-4 font-medium"
					data-testid="commit-zone"
					disabled={!selected || !role.roundId}
					onClick={commit}
					type="button"
				>
					{mine ? "Change" : "Commit"}
				</button>
			</div>
			{selected && !selected.insideArea && (
				<p className="text-amber-700 text-sm" data-testid="hiding-outside-area">
					{selected.name} is outside the game area. You can still hide here —
					this is a reminder, not a rule.
				</p>
			)}
			{farFromStation && (
				<p
					className="text-amber-700 text-sm"
					data-testid="hiding-station-distance"
				>
					That is {formatDistance(nearestMeters)} from the nearest station in
					play.
				</p>
			)}
			{mine && (
				<p
					className="text-muted-foreground text-sm"
					data-testid="committed-stop"
				>
					Zone committed.
				</p>
			)}
		</section>
	);
}

function formatDistance(meters: number): string {
	if (meters < 1_000) return `${Math.round(meters)} m`;
	return `${(meters / 1_000).toFixed(1)} km`;
}
