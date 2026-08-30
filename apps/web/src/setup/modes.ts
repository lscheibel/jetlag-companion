import type { ModeId } from "@zero-lag/catalog";

/**
 * How a mode of transit introduces itself on the setup screens.
 *
 * Only three of them have a colour, because only three of them have one in the
 * city: U-Bahn blue, S-Bahn green and tram amber are the signage, and a bus is
 * not a fourth signal colour that the token set forgot. The rest wear the
 * neutral, which is the honest answer rather than an invented hue.
 */

export interface ModeLabel {
	readonly name: string;
	/** One or two characters for the badge. */
	readonly badge: string;
	/** A transit role token, or null for the neutral. */
	readonly color: string | null;
}

export const MODE_LABELS: Readonly<Record<ModeId, ModeLabel>> = {
	"u-bahn": { name: "U-Bahn", badge: "U", color: "var(--transit-u)" },
	"s-bahn": { name: "S-Bahn", badge: "S", color: "var(--transit-s)" },
	tram: { name: "Tram", badge: "T", color: "var(--transit-tram)" },
	bus: { name: "Bus", badge: "B", color: null },
	regional: { name: "Regional trains", badge: "RE", color: null },
	"long-distance": { name: "Fast trains", badge: "IC", color: null },
	ferry: { name: "Ferries", badge: "F", color: null },
	funicular: { name: "Funiculars", badge: "≡", color: null },
};

export function modeLabel(modeId: ModeId): ModeLabel {
	return MODE_LABELS[modeId];
}

/** "9 lines · 175 stops", with the singulars right. */
export function modeTallyText(lines: number, stops: number): string {
	const lineText = lines === 1 ? "1 line" : `${lines} lines`;
	const stopText =
		stops === 1 ? "1 stop" : `${stops.toLocaleString("en")} stops`;
	return lines > 0 ? `${lineText} · ${stopText}` : stopText;
}

/** U-Bahn, S-Bahn, tram, bus — then the ones a city game rarely turns on. */
export const MODE_ORDER: readonly ModeId[] = [
	"u-bahn",
	"s-bahn",
	"tram",
	"bus",
	"regional",
	"long-distance",
	"ferry",
	"funicular",
];
