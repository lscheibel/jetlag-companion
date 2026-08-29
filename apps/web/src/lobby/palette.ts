import {
	COLOR_NAMES,
	EMOJI_NAMES,
	TEAM_COLORS,
	TEAM_EMOJI,
} from "@zero-lag/schema";
import type { PickerOption } from "@zero-lag/ui/components/picker";

export {
	COLOR_NAMES,
	EMOJI_NAMES,
	EMOJI_TEAM_NAMES,
	identityName,
	starterTeams,
	suggestIdentity,
	TEAM_COLORS,
	TEAM_EMOJI,
} from "@zero-lag/schema";

export const COLOR_OPTIONS: readonly PickerOption[] = TEAM_COLORS.map(
	(value) => ({ value, label: COLOR_NAMES[value] ?? value }),
);

export const EMOJI_OPTIONS: readonly PickerOption[] = TEAM_EMOJI.map(
	(value) => ({ value, label: EMOJI_NAMES[value] ?? value }),
);

/** The same lists, with whoever already holds a colour or a face marked. */
export function withTaken(
	options: readonly PickerOption[],
	takenBy: ReadonlyMap<string, string>,
): readonly PickerOption[] {
	return options.map((option) => ({
		...option,
		takenBy: takenBy.get(option.value) ?? null,
	}));
}
