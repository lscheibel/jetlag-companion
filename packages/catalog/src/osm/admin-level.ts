/**
 * What an OSM `admin_level` is called in Germany — for display only.
 *
 * **Nothing may derive a scale preset from this table.** The levels are not
 * uniform across the country: a Landkreis and a kreisfreie Stadt are both 6,
 * level 7 (Amt, Samtgemeinde, Verbandsgemeinde) exists in some Länder and not
 * others, and Berlin — the seed city — is a Bundesland that is also a single
 * Gemeinde, so its twelve Bezirke sit at **9** rather than 6, with Ortsteile at
 * 10. Hamburg has the same shape.
 *
 * So "Bezirk" is a word that lands on a different level depending on where you
 * are, and a preset chosen from the level would be wrong in exactly the city
 * this is being built for. The preset is suggested from the selected area's own
 * extent instead (m4-spec §6); this table only decides what the picker prints
 * next to a name, and only when OSM has not said it itself.
 */
export const GERMAN_ADMIN_LEVEL_LABELS: Readonly<Record<number, string>> = {
	2: "Staat",
	4: "Bundesland",
	5: "Regierungsbezirk",
	6: "Kreis",
	7: "Amt",
	8: "Gemeinde",
	9: "Stadtbezirk",
	10: "Ortsteil",
	11: "Quartier",
};

/** The narrowest level worth offering, and the widest. Outside this is malformed. */
export const MIN_ADMIN_LEVEL = 1;
export const MAX_ADMIN_LEVEL = 12;

/**
 * The word to show beside a boundary's name.
 *
 * `name:prefix` wins because it is the mapper's own word for this specific
 * object — Berlin's Bezirk relations carry `name:prefix=Bezirk` — which is data
 * rather than an inference from the level. How widely that tag is set across
 * Germany is a question for the extract, not for this function.
 */
export function boundaryLabel(
	adminLevel: number,
	labelPrefix: string | null,
): string {
	return (
		labelPrefix ??
		GERMAN_ADMIN_LEVEL_LABELS[adminLevel] ??
		`Ebene ${adminLevel}`
	);
}
