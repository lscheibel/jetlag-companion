import type { PositionSnapshot, TeamRole } from "@zero-lag/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
	applyExternalFix,
	isFresherFix,
	openPresenceRoom,
	readPresence,
} from "./presence";

/**
 * Presence writes from the tracking webhook. m15-spec §5.
 *
 * The room is in-memory and the interesting bugs are about what happens when
 * two sources write the same player: an older retry must not rewind the
 * marker, and a ping is also the moment we learn this player swapped sides.
 */

const GAME = "game-1";
const PLAYER = "player-1";

let disposeRoom: (() => void) | null = null;

afterEach(() => {
	disposeRoom?.();
	disposeRoom = null;
});

function snapshot(
	capturedAt: number,
	lat: number,
	lng: number,
): PositionSnapshot {
	return {
		lng,
		lat,
		accuracyMeters: null,
		headingDeg: null,
		speedMps: null,
		capturedAt,
		source: "external",
		// This machine's clock, as `ingestPing` stamps it. Ages are measured from
		// it, so a synthetic value here would date every fix to 1970.
		receivedAt: Date.now(),
	};
}

/** A marker showing a fix that was `capturedAgeMs` old when it landed, just now. */
function held(capturedAgeMs: number, receivedAt = Date.now()) {
	return { capturedAgeMs, fix: { receivedAt } };
}

function ping(input: {
	capturedAt: number;
	lat?: number;
	lng?: number;
	displayName?: string;
	teamId?: string | null;
	role?: TeamRole | null;
	capturedAgeMs?: number;
}): void {
	applyExternalFix({
		gameId: GAME,
		playerId: PLAYER,
		displayName: input.displayName ?? "Ana",
		teamId: input.teamId ?? "hiders",
		role: input.role ?? "hider",
		fix: snapshot(input.capturedAt, input.lat ?? 52.52, input.lng ?? 13.405),
		capturedAgeMs: input.capturedAgeMs ?? 0,
	});
}

describe("which fix the live marker keeps", () => {
	it("takes a first fix, and one younger than what is showing", () => {
		expect(isFresherFix(null, 0)).toBe(true);
		expect(isFresherFix(held(10_000), 1_000)).toBe(true);
	});

	it("refuses an older fix and a re-offer of the one already showing", () => {
		expect(isFresherFix(held(1_000), 10_000)).toBe(false);
		expect(isFresherFix(held(1_000), 1_000)).toBe(false);
	});

	it("ages what it holds, so a heartbeat of a held fix never wins", () => {
		// The browser re-offers the same fix two seconds on, reporting the two
		// seconds. The room has counted them too, so this is still a tie.
		const now = Date.now();
		expect(isFresherFix(held(1_000, now), 3_000, now + 2_000)).toBe(false);
	});

	it("compares ages, not clocks, so a phone an hour out still reports", () => {
		// m0-spec §7. A tracker's `capturedAt` is its own device's clock and the
		// browser's is another's — often literally another device, since the page
		// may be open on a laptop. Only the ages are comparable, and by age this
		// ping is two minutes fresher than the marker.
		const now = Date.now();
		expect(isFresherFix(held(120_000, now), 5_000, now)).toBe(true);
	});
});

describe("applyExternalFix", () => {
	it("does not rewind the marker when an older ping arrives later", () => {
		disposeRoom = openPresenceRoom(GAME);

		ping({ capturedAt: 2_000, lat: 52.53, lng: 13.41, capturedAgeMs: 0 });
		ping({ capturedAt: 1_000, lat: 52.5, lng: 13.4, capturedAgeMs: 5_000 });

		const entry = readPresence(GAME, PLAYER);
		expect(entry?.fix).toMatchObject({
			lat: 52.53,
			lng: 13.41,
			capturedAt: 2_000,
		});
		expect(entry?.capturedAgeMs).toBe(0);
	});

	it("still updates team and role when the position is skipped", () => {
		disposeRoom = openPresenceRoom(GAME);

		ping({ capturedAt: 2_000, role: "seeker", teamId: "seekers" });
		ping({
			capturedAt: 1_000,
			capturedAgeMs: 5_000,
			role: "hider",
			teamId: "hiders",
			displayName: "Ana K.",
		});

		const entry = readPresence(GAME, PLAYER);
		expect(entry?.fix?.capturedAt).toBe(2_000);
		expect(entry?.role).toBe("hider");
		expect(entry?.teamId).toBe("hiders");
		expect(entry?.displayName).toBe("Ana K.");
	});

	it("creates an offline entry when the player has no socket", () => {
		disposeRoom = openPresenceRoom(GAME);
		ping({ capturedAt: 1_000 });

		const entry = readPresence(GAME, PLAYER);
		expect(entry?.online).toBe(false);
		expect(entry?.fix?.lat).toBe(52.52);
		expect(entry?.role).toBe("hider");
	});

	it("does nothing when nobody is listening", () => {
		ping({ capturedAt: 1_000 });
		expect(readPresence(GAME, PLAYER)).toBeUndefined();
	});
});
