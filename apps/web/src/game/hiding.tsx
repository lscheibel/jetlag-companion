import { useQuery, useZero } from "@rocicorp/zero/react";
import {
	circleRegion,
	normalizeRegion,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "./panel";
import type { MyRole } from "./use-role";

interface HidingProps {
	role: MyRole;
}

/**
 * Committing a zone materialises its geometry rather than storing a stop id and
 * a radius, because the radius is host-configurable and a mid-series change
 * must not silently move a zone a team has already committed to. m0-spec §5.
 */
export function Hiding({ role }: HidingProps) {
	const zero = useZero();
	const [games] = useQuery(queries.game());
	const [mapStops] = useQuery(queries.mapStops());
	const [commitments] = useQuery(queries.commitments());
	const [stopId, setStopId] = useState("");

	const mapConfig = games[0]?.mapConfig;
	const mine = commitments.find(
		(commitment) => commitment.hiderTeamId === role.teamId,
	);

	/**
	 * Inside the area first, then by name. Stops outside the area are carried so
	 * a seeker can find the station they are changing at (m4-spec §5), and a
	 * hider picking one gets §3's advisory notice rather than a locked control.
	 */
	const choices = [...mapStops].sort(
		(a, b) =>
			Number(b.insideArea) - Number(a.insideArea) ||
			a.name.localeCompare(b.name, "de"),
	);
	// Derived, not synced: the first choice is the selection until the hider
	// picks otherwise, and the list arriving later must not need an effect.
	const selectedId = stopId || (choices[0]?.stopId ?? "");

	function commit() {
		if (!role.roundId || !role.teamId || !mapConfig) return;
		const stop = choices.find((candidate) => candidate.stopId === selectedId);
		if (!stop) return;

		// One radius, doing both of its jobs. m4-spec §3.
		const zone = regionToMultiPolygon(
			normalizeRegion(
				circleRegion([stop.lng, stop.lat], mapConfig.hidingRadiusMeters),
			),
		);

		void zero.mutate(
			mutators.round.commitZone({
				eventId: crypto.randomUUID(),
				commitmentId: crypto.randomUUID(),
				roundId: role.roundId,
				hiderTeamId: role.teamId,
				stopId: stop.stopId,
				zone: zone.map((polygon) =>
					polygon.map((ring) =>
						ring.map(([lng, lat]) => [lng, lat] as [number, number]),
					),
				),
			}),
		);
	}

	if (role.role !== "hider") return null;

	const selected = choices.find((stop) => stop.stopId === selectedId);

	return (
		<Panel testId="hiding" title="Hiding">
			<div className="flex gap-2">
				<select
					className="flex-1 rounded border p-1"
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
					className="rounded border px-2"
					data-testid="commit-zone"
					disabled={!role.roundId}
					onClick={commit}
					type="button"
				>
					Commit
				</button>
			</div>
			{selected && !selected.insideArea && (
				<p data-testid="hiding-outside-area">
					{selected.name} is outside the game area. You can still hide here —
					this is a reminder, not a rule.
				</p>
			)}
			{mine && <p data-testid="committed-stop">Committed to {mine.stopId}</p>}
		</Panel>
	);
}
