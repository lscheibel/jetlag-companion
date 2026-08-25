import { useQuery } from "@rocicorp/zero/react";
import { multiPolygonToRegion, regionContains } from "@zero-lag/geo";
import { queries } from "@zero-lag/schema";
import { Surface } from "@zero-lag/ui/components/surface";
import type { MyRole } from "./use-role";

interface ZoneNoticeProps {
	role: MyRole;
	fix: {
		readonly lng: number;
		readonly lat: number;
		readonly source: string;
	} | null;
}

/**
 * This is deliberately only a read. Leaving a zone is a private nudge computed
 * from two values already on the hider's phone; it never becomes game state or
 * an ephemeral message. m5-spec §7.
 */
export function ZoneNotice({ role, fix }: ZoneNoticeProps) {
	const [commitments] = useQuery(queries.commitments());

	if (
		role.role !== "hider" ||
		role.roundStatus !== "seeking" ||
		!role.teamId ||
		!fix ||
		fix.source === "unavailable"
	) {
		return null;
	}

	const commitment = commitments.find(
		(value) =>
			value.roundId === role.roundId && value.hiderTeamId === role.teamId,
	);
	if (
		!commitment ||
		regionContains(multiPolygonToRegion(commitment.zone), [fix.lng, fix.lat])
	) {
		return null;
	}

	return (
		<Surface
			className="px-3 py-2 font-medium text-sm"
			data-testid="zone-leave-notice"
			raised
		>
			Looks like you left your hiding zone.
		</Surface>
	);
}
