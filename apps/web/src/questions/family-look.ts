import type { QuestionFamilyId } from "@zero-lag/rules";
import type { IconName } from "@zero-lag/ui/components/icon";

/**
 * How each family is drawn, kept out of `@zero-lag/rules` on purpose: the
 * catalog is the rulebook, and a rulebook has no opinion about glyphs.
 *
 * `shape` is what the options look like rather than what they are. A radar
 * rung is a number and belongs centred in a mono face; a matching subject is a
 * name with an example under it and belongs left-aligned. Photo subjects are
 * sentences, so they get the whole width.
 */
export interface FamilyLook {
	readonly icon: IconName;
	readonly columns: 1 | 2 | 3;
	readonly shape: "value" | "subject";
}

export const FAMILY_LOOK: Readonly<Record<QuestionFamilyId, FamilyLook>> = {
	radar: { icon: "broadcast", columns: 3, shape: "value" },
	matching: { icon: "equals", columns: 2, shape: "subject" },
	measuring: { icon: "ruler", columns: 2, shape: "subject" },
	thermometer: { icon: "thermometer-simple", columns: 3, shape: "value" },
	photo: { icon: "camera", columns: 1, shape: "subject" },
	tentacle: { icon: "tree-structure", columns: 2, shape: "subject" },
};
