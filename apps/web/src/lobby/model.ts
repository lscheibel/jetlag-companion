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
 * Everything else is allowed. Lopsided teams, one seeker team against
 * three hiders: none of it in the way. Deciding a five-against-one is a
 * bad idea is the group's job.
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

function assignedSides(
	teams: readonly { readonly role: TeamRole | null }[],
): Set<TeamRole> {
	return new Set(teams.flatMap((team) => (team.role ? [team.role] : [])));
}

/** A game needs somebody hiding and somebody seeking — one team of each. */
export function hasBothSides(
	teams: readonly { readonly role: TeamRole | null }[],
): boolean {
	const sides = assignedSides(teams);
	return sides.has("hider") && sides.has("seeker");
}

/**
 * The side a new team should start on: whichever the board still needs, and
 * hiding when that does not decide it. The host can still tap the other.
 */
export function suggestSide(
	teams: readonly { readonly role: TeamRole | null }[],
): TeamRole {
	const sides = assignedSides(teams);
	if (!sides.has("hider")) return "hider";
	if (!sides.has("seeker")) return "seeker";
	return "hider";
}

export function teamsContinueNote(
	teams: readonly { readonly role: TeamRole | null }[],
): string {
	if (hasBothSides(teams)) {
		return "People pick which team they are on in the lobby.";
	}
	const sides = assignedSides(teams);
	if (!sides.has("hider") && !sides.has("seeker")) {
		return "Add a hiding team and a seeking team.";
	}
	if (!sides.has("hider")) return "Add a hiding team.";
	return "Add a seeking team.";
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
 * Every hider team has been marked found. One outcome per hider, stamped by
 * whichever seeker found them.
 */
export function hidersAllFound(
	hiderTeamIds: readonly string[],
	outcomes: readonly {
		readonly roundId: string;
		readonly hiderTeamId: string;
		readonly foundAt?: number | null;
	}[],
	roundId: string,
): boolean {
	return (
		hiderTeamIds.length > 0 &&
		hiderTeamIds.every((teamId) =>
			outcomes.some(
				(outcome) =>
					outcome.roundId === roundId &&
					outcome.hiderTeamId === teamId &&
					outcome.foundAt != null,
			),
		)
	);
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
