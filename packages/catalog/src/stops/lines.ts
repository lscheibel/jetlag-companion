import { MODE_IDS, type ModeId } from "./modes";
import type { StopLine } from "./types";

/**
 * `modeIds` is derived from `lines` so a readout cannot drift from the names
 * on the card. Order follows `MODE_IDS`, not the feed.
 */
export function modeIdsFromLines(lines: readonly StopLine[]): ModeId[] {
	const present = new Set(lines.map((line) => line.modeId));
	return MODE_IDS.filter((modeId) => present.has(modeId));
}

/** `U2` before `U8` before `U10`. */
export function compareLineNames(a: string, b: string): number {
	return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
}

export function groupLinesByMode(
	lines: readonly StopLine[],
): readonly { readonly modeId: ModeId; readonly names: readonly string[] }[] {
	const namesByMode = new Map<string, string[]>();
	for (const line of lines) {
		const names = namesByMode.get(line.modeId) ?? [];
		names.push(line.name);
		namesByMode.set(line.modeId, names);
	}
	return MODE_IDS.flatMap((modeId) => {
		const names = namesByMode.get(modeId);
		if (!names || names.length === 0) return [];
		return [
			{
				modeId,
				names: [...new Set(names)].sort(compareLineNames),
			},
		];
	});
}
