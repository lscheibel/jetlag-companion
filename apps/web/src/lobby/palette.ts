/**
 * Team identity: a name, a colour and an emoji, always all three at once.
 * m1-spec §4.
 *
 * The palette is short and high-contrast rather than a colour wheel, because it
 * is read on a phone screen in direct sun. These eight are the Okabe–Ito
 * qualitative set — chosen so that deuteranopia, protanopia and tritanopia keep
 * them distinguishable — with the eighth swapped for a neutral, since a colour
 * wheel's eighth hue is where a safe palette stops being safe.
 *
 * Colour is never the only channel. `TeamBadge` renders emoji, name and colour
 * together everywhere a team appears, so the palette carries no information on
 * its own — which is what makes the citron swatch acceptable on a light
 * background rather than a legibility problem.
 */
export const TEAM_COLORS = [
	"#D55E00", // vermillion
	"#0072B2", // cobalt
	"#009E73", // jade
	"#CC79A7", // orchid
	"#E69F00", // amber
	"#56B4E9", // sky
	"#F0E442", // citron
	"#4B4B4B", // slate
] as const;

/**
 * A curated list rather than the system picker. A skin-tone-modified family
 * emoji at 16px on a map marker is not a team identity; these are silhouettes
 * that survive being small, and none of them takes a modifier.
 */
export const TEAM_EMOJI = [
	"🦊",
	"🐙",
	"🦉",
	"🐝",
	"🦈",
	"🐢",
	"🦩",
	"🐉",
] as const;

/** The first swatch nobody has taken, so a new team is distinct by default. */
export function suggestIdentity(
	taken: readonly { color: string; emoji: string }[],
): { color: string; emoji: string } {
	const colors = new Set(taken.map((team) => team.color));
	const emoji = new Set(taken.map((team) => team.emoji));
	return {
		color: TEAM_COLORS.find((color) => !colors.has(color)) ?? TEAM_COLORS[0],
		emoji: TEAM_EMOJI.find((value) => !emoji.has(value)) ?? TEAM_EMOJI[0],
	};
}
