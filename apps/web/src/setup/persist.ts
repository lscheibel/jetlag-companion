import type { Zero } from "@rocicorp/zero";
import { mutators } from "@zero-lag/schema";
import { applyMap, type MapDraftBody } from "../builder/api";
import type { Session } from "../session";
import type { SetupState } from "./wizard";

/**
 * Write whatever the wizard (or a lobby revisit) has changed: the board if
 * modes, scale or hiding radius moved, and the round clock if the duration did.
 */
export async function persistSetup(
	session: Session,
	setup: SetupState,
	zero: Pick<Zero, "mutate">,
): Promise<void> {
	const { area, roundId, currentHidingDurationMs } = setup;
	if (!area) throw new Error("no_board");

	if (boardChanged(setup)) {
		await applyMap(session, mapDraftFromSetup(setup));
	}

	if (roundId && currentHidingDurationMs !== setup.hidingDurationMs) {
		await zero.mutate(
			mutators.round.setHidingDuration({
				eventId: crypto.randomUUID(),
				roundId,
				hidingDurationMs: setup.hidingDurationMs,
			}),
		).server;
	}
}

export function boardChanged(setup: SetupState): boolean {
	const area = setup.area;
	if (!area) return false;
	return (
		!sameModes(area.modeIds, setup.selectedModes) ||
		area.scalePreset !== setup.band.scalePreset ||
		area.hidingRadiusMeters !== setup.hidingRadiusMeters
	);
}

export function mapDraftFromSetup(setup: SetupState): MapDraftBody {
	const area = setup.area;
	if (!area) throw new Error("no_board");
	const shared = {
		name: area.name,
		scalePreset: setup.band.scalePreset,
		hidingRadiusMeters: setup.hidingRadiusMeters,
		modeIds: setup.selectedModes ?? undefined,
	};
	if (area.selection.kind === "composed") {
		return { ...shared, pieces: area.selection.pieces };
	}
	const ring = area.selection.polygon[0]?.[0];
	if (!ring || ring.length < 3) throw new Error("empty_area");
	return {
		...shared,
		ring: ring.map(([lng, lat]) => [lng, lat] as [number, number]),
	};
}

function sameModes(
	a: readonly string[] | null,
	b: readonly string[] | null,
): boolean {
	if (a === null || b === null) return a === b;
	if (a.length !== b.length) return false;
	const left = [...a].sort();
	const right = [...b].sort();
	return left.every((value, index) => value === right[index]);
}
