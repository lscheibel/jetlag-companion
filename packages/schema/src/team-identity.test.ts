import { describe, expect, it } from "vitest";
import {
	identityName,
	starterTeams,
	suggestIdentity,
	TEAM_COLORS,
	TEAM_EMOJI,
} from "./team-identity";

describe("identityName", () => {
	it("joins the colour and the plural creature", () => {
		expect(identityName(TEAM_COLORS[0], TEAM_EMOJI[0])).toBe(
			"Vermillion Foxes",
		);
		expect(identityName(TEAM_COLORS[1], TEAM_EMOJI[1])).toBe(
			"Cobalt Octopuses",
		);
	});
});

describe("starterTeams", () => {
	it("is one hider and one seeker from the first two palette faces", () => {
		const teams = starterTeams();
		expect(teams).toEqual([
			{
				name: "Vermillion Foxes",
				color: TEAM_COLORS[0],
				emoji: TEAM_EMOJI[0],
				role: "hider",
			},
			{
				name: "Cobalt Octopuses",
				color: TEAM_COLORS[1],
				emoji: TEAM_EMOJI[1],
				role: "seeker",
			},
		]);
		expect(suggestIdentity(teams)).toEqual({
			color: TEAM_COLORS[2],
			emoji: TEAM_EMOJI[2],
		});
	});
});
