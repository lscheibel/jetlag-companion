import { describe, expect, it } from "vitest";
import { SCENES, sceneById, scenePath, sceneTableState, YOU } from "./scenes";

describe("debug scene catalog", () => {
	it("gives every scene a unique id", () => {
		const ids = SCENES.map((scene) => scene.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("only assigns known people to known teams", () => {
		for (const scene of SCENES) {
			const names = new Set([YOU, ...scene.extras]);
			const teams = new Set(scene.teams.map((team) => team.name));
			for (const [name, team] of Object.entries(scene.membership)) {
				expect(names.has(name), `${scene.id}: unknown player ${name}`).toBe(
					true,
				);
				expect(teams.has(team), `${scene.id}: unknown team ${team}`).toBe(true);
			}
			for (const team of scene.committedZones) {
				expect(teams.has(team), `${scene.id}: zone for unknown ${team}`).toBe(
					true,
				);
				expect(
					scene.teams.find((row) => row.name === team)?.role,
					`${scene.id}: zone on a non-hider ${team}`,
				).toBe("hider");
			}
		}
	});

	it("sends lobby scenes to the lobby and the rest to the map", () => {
		for (const scene of SCENES) {
			const path = scenePath(scene, "ABCDEF");
			if (scene.group === "lobby") {
				expect(scene.round).toBe("pending");
				expect(path).toBe("/g/ABCDEF");
			} else {
				expect(scene.round).toBe(scene.group);
				expect(path).toBe("/g/ABCDEF/map");
			}
		}
	});
});

describe("debug scene table state", () => {
	it("solo host, no teams", () => {
		expect(state("solo")).toMatchObject({
			playerCount: 1,
			names: [YOU],
			roundStatus: "pending",
			gameStatus: "lobby",
			teamCount: 0,
			unassigned: [YOU],
			ready: false,
			committedZones: [],
		});
	});

	it("many players, nobody on a team", () => {
		expect(state("many-unteamed")).toMatchObject({
			playerCount: 7,
			roundStatus: "pending",
			gameStatus: "lobby",
			teamCount: 0,
			unassigned: ["You", "Ana", "Ben", "Cara", "Dev", "Eli", "Fay"],
			ready: false,
			committedZones: [],
		});
	});

	it("empty teams, no sides", () => {
		expect(state("empty-teams")).toMatchObject({
			playerCount: 1,
			roundStatus: "pending",
			teamCount: 2,
			roles: { Foxes: null, Owls: null },
			unassigned: [YOU],
			committedZones: [],
		});
	});

	it("people on teams, no sides", () => {
		expect(state("no-sides")).toMatchObject({
			playerCount: 3,
			roundStatus: "pending",
			roles: { Foxes: null, Owls: null },
			membership: { [YOU]: "Foxes", Ana: "Foxes", Ben: "Owls" },
			unassigned: [],
			committedZones: [],
		});
	});

	it("partial teams: both sides, some unassigned", () => {
		expect(state("partial-teams")).toMatchObject({
			playerCount: 4,
			roundStatus: "pending",
			roles: { Hiders: "hider", Seekers: "seeker" },
			membership: { [YOU]: "Seekers", Ana: "Hiders" },
			unassigned: ["Ben", "Cara"],
			ready: false,
			committedZones: [],
		});
	});

	it("ready to start", () => {
		expect(state("ready-to-start")).toMatchObject({
			playerCount: 2,
			roundStatus: "pending",
			gameStatus: "lobby",
			roles: { Hiders: "hider", Seekers: "seeker" },
			membership: { [YOU]: "Seekers", Ana: "Hiders" },
			unassigned: [],
			ready: true,
			committedZones: [],
		});
	});

	it("hiding, no zone, as hider", () => {
		expect(state("hiding-no-zone-hider")).toMatchObject({
			roundStatus: "hiding",
			gameStatus: "running",
			membership: { [YOU]: "Hiders", Ana: "Seekers" },
			committedZones: [],
		});
	});

	it("hiding, no zone, as seeker", () => {
		expect(state("hiding-no-zone-seeker")).toMatchObject({
			roundStatus: "hiding",
			membership: { [YOU]: "Seekers", Ana: "Hiders" },
			committedZones: [],
		});
	});

	it("hiding, zone committed, as hider", () => {
		expect(state("hiding-zone-hider")).toMatchObject({
			roundStatus: "hiding",
			membership: { [YOU]: "Hiders" },
			committedZones: ["Hiders"],
		});
	});

	it("hiding, zone committed, as seeker", () => {
		expect(state("hiding-zone-seeker")).toMatchObject({
			roundStatus: "hiding",
			membership: { [YOU]: "Seekers" },
			committedZones: ["Hiders"],
		});
	});

	it("hiding, one of two hider zones missing", () => {
		expect(state("hiding-partial-zones")).toMatchObject({
			playerCount: 3,
			roundStatus: "hiding",
			roles: { Foxes: "hider", Owls: "hider", Seekers: "seeker" },
			membership: { [YOU]: "Foxes", Ana: "Owls", Ben: "Seekers" },
			committedZones: ["Owls"],
		});
	});

	it("seeking as hider", () => {
		expect(state("seeking-hider")).toMatchObject({
			roundStatus: "seeking",
			gameStatus: "running",
			membership: { [YOU]: "Hiders" },
			committedZones: ["Hiders"],
		});
	});

	it("seeking as seeker", () => {
		expect(state("seeking-seeker")).toMatchObject({
			roundStatus: "seeking",
			gameStatus: "running",
			membership: { [YOU]: "Seekers" },
			committedZones: ["Hiders"],
		});
	});
});

function state(id: string) {
	const scene = sceneById(id);
	if (!scene) throw new Error(`missing scene ${id}`);
	return sceneTableState(scene);
}
