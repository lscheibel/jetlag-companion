import type { TeamRole } from "@zero-lag/schema";

/**
 * Named boards the start-page debug menu can drop you into.
 *
 * Pure data: a scene is the rows a real game would have after the wizard,
 * lobby and (optionally) the whistle. The spawn path writes them. Keep this
 * file free of the database so the catalog can be tested without Postgres.
 */

export const YOU = "You";

export type SceneGroup = "lobby" | "hiding" | "seeking";

export interface SceneTeam {
	readonly name: string;
	readonly role?: TeamRole;
}

export interface Scene {
	readonly id: string;
	readonly group: SceneGroup;
	readonly label: string;
	readonly hint: string;
	/** Everyone except the host. The host is always {@link YOU}. */
	readonly extras: readonly string[];
	readonly teams: readonly SceneTeam[];
	/** Display name → team name. Omitted names are unassigned. */
	readonly membership: Readonly<Record<string, string>>;
	readonly ready: boolean;
	readonly round: "pending" | "hiding" | "seeking";
	/** Hider team names that already have a `hidingCommitment`. */
	readonly committedZones: readonly string[];
}

export interface SceneSummary {
	readonly id: string;
	readonly group: SceneGroup;
	readonly label: string;
	readonly hint: string;
}

export function scenePath(scene: Scene, code: string): string {
	return scene.round === "pending" ? `/g/${code}` : `/g/${code}/map`;
}

export function sceneSummaries(): readonly SceneSummary[] {
	return SCENES.map(({ id, group, label, hint }) => ({
		id,
		group,
		label,
		hint,
	}));
}

export function sceneById(id: string): Scene | undefined {
	return SCENES.find((scene) => scene.id === id);
}

/** What spawn will write, derived from the catalog rather than from Postgres. */
export interface SceneTableState {
	readonly playerCount: number;
	readonly names: readonly string[];
	readonly roundStatus: Scene["round"];
	readonly gameStatus: "lobby" | "running";
	readonly teamCount: number;
	readonly roles: Readonly<Record<string, TeamRole | null>>;
	readonly membership: Readonly<Record<string, string>>;
	readonly unassigned: readonly string[];
	readonly ready: boolean;
	readonly committedZones: readonly string[];
}

export function sceneTableState(scene: Scene): SceneTableState {
	const names = [YOU, ...scene.extras];
	return {
		playerCount: names.length,
		names,
		roundStatus: scene.round,
		gameStatus: scene.round === "pending" ? "lobby" : "running",
		teamCount: scene.teams.length,
		roles: Object.fromEntries(
			scene.teams.map((team) => [team.name, team.role ?? null]),
		),
		membership: scene.membership,
		unassigned: names.filter((name) => scene.membership[name] === undefined),
		ready: scene.ready,
		committedZones: scene.committedZones,
	};
}

export const SCENES: readonly Scene[] = [
	{
		id: "solo",
		group: "lobby",
		label: "Solo host, no teams",
		hint: "Just you, in an empty lobby",
		extras: [],
		teams: [],
		membership: {},
		ready: false,
		round: "pending",
		committedZones: [],
	},
	{
		id: "many-unteamed",
		group: "lobby",
		label: "Many players, no teams",
		hint: "A crowded lobby, nobody assigned",
		extras: ["Ana", "Ben", "Cara", "Dev", "Eli", "Fay"],
		teams: [],
		membership: {},
		ready: false,
		round: "pending",
		committedZones: [],
	},
	{
		id: "empty-teams",
		group: "lobby",
		label: "Empty teams, no sides",
		hint: "Two teams exist, nobody is on them",
		extras: [],
		teams: [{ name: "Foxes" }, { name: "Owls" }],
		membership: {},
		ready: false,
		round: "pending",
		committedZones: [],
	},
	{
		id: "no-sides",
		group: "lobby",
		label: "People on teams, no sides",
		hint: "Everyone is assigned, no hider or seeker yet",
		extras: ["Ana", "Ben"],
		teams: [{ name: "Foxes" }, { name: "Owls" }],
		membership: { [YOU]: "Foxes", Ana: "Foxes", Ben: "Owls" },
		ready: false,
		round: "pending",
		committedZones: [],
	},
	{
		id: "partial-teams",
		group: "lobby",
		label: "Partial teams",
		hint: "Both sides exist, some people still unassigned",
		extras: ["Ana", "Ben", "Cara"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Seekers", Ana: "Hiders" },
		ready: false,
		round: "pending",
		committedZones: [],
	},
	{
		id: "ready-to-start",
		group: "lobby",
		label: "Ready to start",
		hint: "Both sides, everyone ready, whistle available",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Seekers", Ana: "Hiders" },
		ready: true,
		round: "pending",
		committedZones: [],
	},
	{
		id: "hiding-no-zone-hider",
		group: "hiding",
		label: "Hiding, no zone — as hider",
		hint: "The countdown is running; you have not committed",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Hiders", Ana: "Seekers" },
		ready: true,
		round: "hiding",
		committedZones: [],
	},
	{
		id: "hiding-no-zone-seeker",
		group: "hiding",
		label: "Hiding, no zone — as seeker",
		hint: "Waiting on the other side to hide",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Seekers", Ana: "Hiders" },
		ready: true,
		round: "hiding",
		committedZones: [],
	},
	{
		id: "hiding-zone-hider",
		group: "hiding",
		label: "Hiding, zone committed — as hider",
		hint: "Your zone is in; still the hiding phase",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Hiders", Ana: "Seekers" },
		ready: true,
		round: "hiding",
		committedZones: ["Hiders"],
	},
	{
		id: "hiding-zone-seeker",
		group: "hiding",
		label: "Hiding, zone committed — as seeker",
		hint: "The hiders have a zone; you cannot see it",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Seekers", Ana: "Hiders" },
		ready: true,
		round: "hiding",
		committedZones: ["Hiders"],
	},
	{
		id: "hiding-partial-zones",
		group: "hiding",
		label: "Hiding, one of two zones",
		hint: "You are the hider team that has not committed",
		extras: ["Ana", "Ben"],
		teams: [
			{ name: "Foxes", role: "hider" },
			{ name: "Owls", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Foxes", Ana: "Owls", Ben: "Seekers" },
		ready: true,
		round: "hiding",
		committedZones: ["Owls"],
	},
	{
		id: "seeking-hider",
		group: "seeking",
		label: "Seeking — as hider",
		hint: "The hunt is on; you are hiding",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Hiders", Ana: "Seekers" },
		ready: true,
		round: "seeking",
		committedZones: ["Hiders"],
	},
	{
		id: "seeking-seeker",
		group: "seeking",
		label: "Seeking — as seeker",
		hint: "The hunt is on; you are looking",
		extras: ["Ana"],
		teams: [
			{ name: "Hiders", role: "hider" },
			{ name: "Seekers", role: "seeker" },
		],
		membership: { [YOU]: "Seekers", Ana: "Hiders" },
		ready: true,
		round: "seeking",
		committedZones: ["Hiders"],
	},
];
