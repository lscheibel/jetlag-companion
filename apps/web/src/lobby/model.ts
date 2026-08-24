import type { TeamRole } from "@zero-lag/schema";

/**
 * What the lobby is looking at, and what it refuses to start on.
 *
 * The lobby is the **only** place this app refuses to continue. Once a round is
 * running nothing is enforced — hand limits, curse costs and hiding zones all
 * warn and carry on — because those are rules a group agreed to and can bend.
 * The four conditions below are not rules anybody agreed to: they are the
 * difference between a game and a broken one.
 *
 * Everything else is a remark. Lopsided teams, somebody temporarily offline,
 * one seeker team against three hiders: said out loud, and none of it in the
 * way. Deciding a five-against-one is a bad idea is the group's job.
 */

export interface LobbyPerson {
	readonly id: string;
	readonly displayName: string;
	readonly isHost: boolean;
	readonly readyAt: number | null;
	readonly teamId: string | null;
	readonly online: boolean;
	/**
	 * Elapsed time since they were last online, as stamped on the presence
	 * frame. Null if this device has never seen them on the channel. Zero while
	 * they are online. The sheet counts up from it using the time since the
	 * frame arrived — the same arithmetic as a fix's age.
	 */
	readonly lastSeenAgeMs: number | null;
}

export interface LobbyTeamView {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly emoji: string;
	readonly role: TeamRole | null;
	readonly members: readonly LobbyPerson[];
}

export type Blocker =
	| { readonly kind: "no-teams" }
	| { readonly kind: "one-sided"; readonly missing: TeamRole };

/**
 * Four things hold a start, and only two of them are worth a card.
 *
 * A player on no team and a team with nobody on it are both **already on the
 * board**, in the alert colour, in the place they happen — the person is in the
 * group at the top and the empty team says so where its members would be. A
 * card above the button repeating either of them is the same warning twice, and
 * a screen that says everything twice is a screen people stop reading.
 *
 * What is left is the pair with nowhere else to appear: no teams at all, and a
 * board with only one side on it. Both are absences, and an absence cannot
 * highlight itself.
 */
export function startBlockers(
	teams: readonly LobbyTeamView[],
	people: readonly LobbyPerson[],
): readonly Blocker[] {
	const blockers: Blocker[] = [];

	if (teams.length === 0) {
		blockers.push({ kind: "no-teams" });
	} else {
		const sides = new Set(
			teams.flatMap((team) => (team.role ? [team.role] : [])),
		);
		if (!sides.has("hider"))
			blockers.push({ kind: "one-sided", missing: "hider" });
		if (!sides.has("seeker"))
			blockers.push({ kind: "one-sided", missing: "seeker" });
	}

	return blockers;
}

export function blockerText(blocker: Blocker): string {
	switch (blocker.kind) {
		case "no-teams":
			return "There are no teams yet";
		case "one-sided":
			return blocker.missing === "hider"
				? "Nobody is hiding"
				: "Nobody is seeking";
	}
}

/**
 * Everything that holds the whistle, including the two the board shows in
 * place. The ready check is the one screen that has to know all four, because
 * it is the screen with the start on it.
 */
export function canStart(
	teams: readonly LobbyTeamView[],
	people: readonly LobbyPerson[],
): boolean {
	return (
		startBlockers(teams, people).length === 0 &&
		teams.every((team) => team.members.length > 0) &&
		people.every((person) => person.teamId !== null) &&
		people.every((person) => person.readyAt !== null)
	);
}

/**
 * Said out loud and allowed. A remark never gates anything, which is why it is
 * a separate list rather than a severity on the one above.
 */
export function startRemarks(
	teams: readonly LobbyTeamView[],
	offline: readonly LobbyPerson[],
): readonly string[] {
	const remarks: string[] = [];

	const sized = teams.filter((team) => team.members.length > 0);
	if (sized.length > 1) {
		const counts = sized.map((team) => team.members.length);
		const smallest = Math.min(...counts);
		const largest = Math.max(...counts);
		if (largest - smallest >= 2) {
			remarks.push(
				`Teams are lopsided — ${largest} against ${smallest}. That is sometimes the point.`,
			);
		}
	}

	if (offline.length === 1) {
		remarks.push(`${offline[0]?.displayName} is offline right now.`);
	} else if (offline.length > 1) {
		remarks.push(`${offline.length} people are offline right now.`);
	}

	return remarks;
}

/** Ready is per person, and the host's start waits for the last of them. */
export function readyCount(people: readonly LobbyPerson[]): {
	ready: number;
	total: number;
	waitingOn: readonly LobbyPerson[];
} {
	const waitingOn = people.filter((person) => person.readyAt === null);
	return {
		ready: people.length - waitingOn.length,
		total: people.length,
		waitingOn,
	};
}

/**
 * Teams ordered by how much they need somebody: the empty one first, then the
 * smallest. A host putting a person on a team is usually solving a shortage
 * rather than browsing.
 */
export function byNeed(
	teams: readonly LobbyTeamView[],
): readonly LobbyTeamView[] {
	return [...teams].sort((a, b) => a.members.length - b.members.length);
}

export function sideWord(role: TeamRole | null): string {
	if (role === "hider") return "Hiding";
	if (role === "seeker") return "Seeking";
	return "No side yet";
}
