import {
	circleRegion,
	normalizeRegion,
	regionToMultiPolygon,
} from "@zero-lag/geo";
import { eq } from "drizzle-orm";
import { issueGameToken } from "../auth";
import { db, drizzleSchema } from "../db";
import { appendEvent } from "../game-log";
import {
	type DbTx,
	DEFAULT_HIDING_DURATION_MS,
	type OpenedGame,
	openGame,
} from "../open-game";
import { type Scene, sceneById, scenePath, YOU } from "./scenes";

/**
 * Duplicated from the lobby palette rather than imported: the web app is not
 * a dependency of the server, and eight swatches are not a package.
 */
const TEAM_COLORS = [
	"#D55E00",
	"#0072B2",
	"#009E73",
	"#CC79A7",
	"#E69F00",
	"#56B4E9",
	"#F0E442",
	"#4B4B4B",
] as const;

const TEAM_EMOJI = ["🦊", "🐙", "🦉", "🐝", "🦈", "🐢", "🦩", "🐉"] as const;

export interface SpawnedScene {
	readonly gameId: string;
	readonly code: string;
	readonly playerId: string;
	readonly token: string;
	readonly path: string;
}

export async function spawnScene(
	id: string,
	deviceId: string,
): Promise<SpawnedScene | null> {
	const scene = sceneById(id);
	if (!scene) return null;

	const opened = await db.transaction(async (tx) => {
		const game = await openGame(tx, { displayName: YOU, deviceId });
		await applyScene(tx, game, scene);
		return game;
	});

	return {
		gameId: opened.gameId,
		code: opened.code,
		playerId: opened.playerId,
		token: await issueGameToken({
			playerId: opened.playerId,
			gameId: opened.gameId,
			deviceId,
		}),
		path: scenePath(scene, opened.code),
	};
}

async function applyScene(
	tx: DbTx,
	game: OpenedGame,
	scene: Scene,
): Promise<void> {
	const now = Date.now();
	const players = new Map<string, string>([[YOU, game.playerId]]);

	for (const name of scene.extras) {
		const playerId = crypto.randomUUID();
		await tx.insert(drizzleSchema.player).values({
			id: playerId,
			gameId: game.gameId,
			displayName: name,
			deviceId: crypto.randomUUID(),
			joinedAt: now,
			isHost: false,
			leftAt: null,
			removedByPlayerId: null,
		});
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "player.joined",
			actorPlayerId: playerId,
			payload: { displayName: name },
		});
		players.set(name, playerId);
	}

	const teams = new Map<string, string>();
	for (const [index, team] of scene.teams.entries()) {
		const teamId = crypto.randomUUID();
		const color = TEAM_COLORS[index % TEAM_COLORS.length] ?? TEAM_COLORS[0];
		const emoji = TEAM_EMOJI[index % TEAM_EMOJI.length] ?? TEAM_EMOJI[0];
		await tx.insert(drizzleSchema.team).values({
			id: teamId,
			gameId: game.gameId,
			name: team.name,
			color,
			emoji,
			createdAt: now,
		});
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "team.created",
			actorPlayerId: game.playerId,
			actorTeamId: teamId,
			payload: { name: team.name, color, emoji },
		});
		teams.set(team.name, teamId);
	}

	for (const [name, teamName] of Object.entries(scene.membership)) {
		const playerId = players.get(name);
		const teamId = teams.get(teamName);
		if (!playerId || !teamId) {
			throw new Error(`scene ${scene.id}: ${name} cannot join ${teamName}`);
		}
		await tx.insert(drizzleSchema.teamMember).values({
			teamId,
			playerId,
			joinedAt: now,
		});
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "team.memberJoined",
			actorPlayerId: playerId,
			actorTeamId: teamId,
			payload: {},
		});
	}

	const roles = scene.teams.flatMap((team) => {
		if (!team.role) return [];
		const teamId = teams.get(team.name);
		if (!teamId) return [];
		return [{ teamId, role: team.role }];
	});
	if (roles.length > 0) {
		for (const role of roles) {
			await tx.insert(drizzleSchema.roundTeamRole).values({
				roundId: game.roundId,
				teamId: role.teamId,
				role: role.role,
			});
		}
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "round.rolesAssigned",
			actorPlayerId: game.playerId,
			payload: { roundId: game.roundId, roles },
		});
	}

	if (scene.ready) {
		for (const playerId of players.values()) {
			await tx
				.update(drizzleSchema.player)
				.set({ readyAt: now })
				.where(eq(drizzleSchema.player.id, playerId));
			await appendEvent(tx, {
				gameId: game.gameId,
				type: "player.readyChanged",
				actorPlayerId: playerId,
				payload: { ready: true },
			});
		}
	}

	if (scene.round !== "pending") {
		const hidingStartedAt = now;
		await tx
			.update(drizzleSchema.game)
			.set({ status: "running" })
			.where(eq(drizzleSchema.game.id, game.gameId));
		await tx
			.update(drizzleSchema.round)
			.set({
				status: "hiding",
				hidingStartedAt,
			})
			.where(eq(drizzleSchema.round.id, game.roundId));
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "round.hidingStarted",
			actorPlayerId: game.playerId,
			payload: {
				roundId: game.roundId,
				startedAt: hidingStartedAt,
				hidingDurationMs: DEFAULT_HIDING_DURATION_MS,
			},
		});
	}

	if (scene.round === "seeking") {
		const seekingStartedAt = now;
		await tx
			.update(drizzleSchema.round)
			.set({
				status: "seeking",
				seekingStartedAt,
			})
			.where(eq(drizzleSchema.round.id, game.roundId));
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "round.seekingStarted",
			actorPlayerId: game.playerId,
			payload: { roundId: game.roundId, startedAt: seekingStartedAt },
		});
	}

	if (scene.committedZones.length === 0) return;

	const stops = game.map.stops.filter((stop) => stop.insideArea);
	for (const [index, teamName] of scene.committedZones.entries()) {
		const teamId = teams.get(teamName);
		const stop = stops[index] ?? stops[0];
		if (!teamId || !stop) {
			throw new Error(
				`scene ${scene.id}: cannot commit a zone for ${teamName}`,
			);
		}
		const zone = regionToMultiPolygon(
			normalizeRegion(
				circleRegion([stop.lng, stop.lat], game.map.hidingRadiusMeters),
			),
		);
		const actorPlayerId =
			[...Object.entries(scene.membership)].find(
				([, membership]) => membership === teamName,
			)?.[0] ?? YOU;
		const actorId = players.get(actorPlayerId) ?? game.playerId;

		await tx.insert(drizzleSchema.hidingCommitment).values({
			id: crypto.randomUUID(),
			roundId: game.roundId,
			hiderTeamId: teamId,
			stopId: stop.stopId,
			zone,
			committedAt: now,
			declaredSpot: null,
		});
		await appendEvent(tx, {
			gameId: game.gameId,
			type: "round.zoneCommitted",
			actorPlayerId: actorId,
			actorTeamId: teamId,
			payload: { roundId: game.roundId, stopId: stop.stopId },
		});
	}
}
