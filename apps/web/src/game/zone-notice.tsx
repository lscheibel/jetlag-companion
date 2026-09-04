import { useQuery } from "@rocicorp/zero/react";
import { multiPolygonToRegion, regionContains } from "@zero-lag/geo";
import { type ClientFix, queries } from "@zero-lag/schema";
import { InlineNotice } from "@zero-lag/ui/components/notice";
import type { MyRole } from "./use-role";

interface ZoneNoticeProps {
	role: MyRole;
	fix: ClientFix | null;
	className?: string;
}

/**
 * This is deliberately only a read. Leaving a zone is a private nudge computed
 * from two values already on the hider's phone; it never becomes game state or
 * an ephemeral message. m5-spec §7.
 *
 * It renders as a line inside the hider's own card rather than as a card of
 * its own. The card is already about the zone this remarks on, and a notice
 * that floats over the map by itself reads as something the game announced.
 */
export function ZoneNotice({ role, fix, className }: ZoneNoticeProps) {
	const [commitments] = useQuery(queries.commitments());
	const eligible =
		role.role === "hider" &&
		(role.roundStatus === "hiding" || role.roundStatus === "seeking") &&
		Boolean(role.teamId) &&
		fix !== null &&
		fix.source !== "unavailable";
	const commitment = eligible
		? commitments.find(
				(value) =>
					value.roundId === role.roundId && value.hiderTeamId === role.teamId,
			)
		: undefined;
	const outside = Boolean(
		eligible &&
			commitment &&
			fix &&
			!regionContains(multiPolygonToRegion(commitment.zone), [
				fix.lng,
				fix.lat,
			]),
	);

	if (!outside) return null;

	return (
		<InlineNotice
			className={className}
			testId="zone-leave-notice"
			title="Looks like you left your hiding zone."
			tone="warn"
		/>
	);
}
