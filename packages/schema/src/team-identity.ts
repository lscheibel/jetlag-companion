import type { TeamRole } from "./types";

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
 * Colour is never the only channel. A badge renders emoji, name and colour
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

/**
 * The same eight, each with the name a screen reader reads out.
 *
 * A picker announcing "#0072B2" is a picker nobody can use without sight, and
 * "taken by the Owls" is the fact a host needs before wondering why a square
 * will not take. The names are the palette's own — the ones the comments above
 * already carry — so there is one vocabulary rather than two.
 */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
	"#D55E00": "Vermillion",
	"#0072B2": "Cobalt",
	"#009E73": "Jade",
	"#CC79A7": "Orchid",
	"#E69F00": "Amber",
	"#56B4E9": "Sky",
	"#F0E442": "Citron",
	"#4B4B4B": "Slate",
};

export const EMOJI_NAMES: Readonly<Record<string, string>> = {
	"🦊": "Fox",
	"🐙": "Octopus",
	"🦉": "Owl",
	"🐝": "Bee",
	"🦈": "Shark",
	"🐢": "Turtle",
	"🦩": "Flamingo",
	"🐉": "Dragon",
};

/** The creature as a team calls itself — plural, because a team is a group. */
export const EMOJI_TEAM_NAMES: Readonly<Record<string, string>> = {
	"🦊": "Foxes",
	"🐙": "Octopuses",
	"🦉": "Owls",
	"🐝": "Bees",
	"🦈": "Sharks",
	"🐢": "Turtles",
	"🦩": "Flamingos",
	"🐉": "Dragons",
};

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

/** Colour plus creature, the name a new team starts with. */
export function identityName(color: string, emoji: string): string {
	const colorName = COLOR_NAMES[color];
	const creature = EMOJI_TEAM_NAMES[emoji] ?? EMOJI_NAMES[emoji];
	if (colorName && creature) return `${colorName} ${creature}`;
	return colorName ?? creature ?? "Team";
}

export interface StarterTeam {
	readonly name: string;
	readonly color: string;
	readonly emoji: string;
	readonly role: TeamRole;
}

/**
 * A new game is a hiding team and a seeking team, named from the first two
 * faces in the palette so the host has something to rename rather than a
 * blank board.
 */
export function starterTeams(): readonly StarterTeam[] {
	const hiders = suggestIdentity([]);
	const seekers = suggestIdentity([hiders]);
	return [
		{ ...hiders, name: identityName(hiders.color, hiders.emoji), role: "hider" },
		{
			...seekers,
			name: identityName(seekers.color, seekers.emoji),
			role: "seeker",
		},
	];
}
