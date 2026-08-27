import { useQuery } from "@rocicorp/zero/react";
import { multiPolygonToRegion, regionContains } from "@zero-lag/geo";
import { queries } from "@zero-lag/schema";
import { Surface } from "@zero-lag/ui/components/surface";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { mapCardMotionProps } from "../map/map-card";
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
	const reducedMotion = useReducedMotion();
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
	const open = Boolean(
		eligible &&
			commitment &&
			fix &&
			!regionContains(multiPolygonToRegion(commitment.zone), [
				fix.lng,
				fix.lat,
			]),
	);

	return (
		<AnimatePresence>
			{open && (
				<motion.div key="zone-notice" {...mapCardMotionProps(reducedMotion)}>
					<Surface
						className="px-3 py-2 font-medium text-sm"
						data-testid="zone-leave-notice"
						raised
					>
						Looks like you left your hiding zone.
					</Surface>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
