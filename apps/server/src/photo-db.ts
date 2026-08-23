import type { GameContext } from "@zero-lag/schema";
import type { Db } from "@zero-lag/schema/db";
import { and, eq, sql } from "drizzle-orm";
import { drizzleSchema } from "./db";
import {
	newPhotoMetadata,
	type ProcessedPhoto,
	readPhotoBlob,
	removePhotoBlobIfUnreferenced,
	writePhotoBlob,
} from "./photo";

export type PhotoRow = typeof drizzleSchema.photo.$inferSelect;

export async function savePhotoUpload(
	database: Db,
	photosPath: string,
	ctx: GameContext,
	processed: ProcessedPhoto,
): Promise<PhotoRow> {
	const row: PhotoRow = newPhotoMetadata(ctx, processed);
	let createdBlob = false;

	try {
		await database.transaction(async (tx) => {
			await lockDigest(tx, processed.sha256);
			const stored = await writePhotoBlob(photosPath, processed);
			createdBlob = stored.created;
			await tx.insert(drizzleSchema.photo).values(row);
		});
		return row;
	} catch (error) {
		if (createdBlob) {
			await deletePhotoBlobIfUnreferenced(
				database,
				photosPath,
				processed.sha256,
			);
		}
		throw error;
	}
}

export async function findPhotoForGame(
	database: Db,
	gameId: string,
	photoId: string,
): Promise<PhotoRow | null> {
	const [photo] = await database
		.select()
		.from(drizzleSchema.photo)
		.where(
			and(
				eq(drizzleSchema.photo.id, photoId),
				eq(drizzleSchema.photo.gameId, gameId),
			),
		)
		.limit(1);
	return photo ?? null;
}

export async function loadPhotoBytes(
	photosPath: string,
	photo: Pick<PhotoRow, "sha256">,
): Promise<Buffer> {
	return readPhotoBlob(photosPath, photo.sha256);
}

/**
 * This is called only after the mutator transaction that deleted a photo row
 * commits. The per-digest advisory lock also covers uploads, closing the race
 * between the final reference check and unlinking shared bytes.
 */
export async function deletePhotoBlobIfUnreferenced(
	database: Db,
	photosPath: string,
	sha256: string,
): Promise<boolean> {
	return database.transaction(async (tx) => {
		await lockDigest(tx, sha256);
		return removePhotoBlobIfUnreferenced(photosPath, sha256, async () => {
			const [reference] = await tx
				.select({ id: drizzleSchema.photo.id })
				.from(drizzleSchema.photo)
				.where(eq(drizzleSchema.photo.sha256, sha256))
				.limit(1);
			return reference !== undefined;
		});
	});
}

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function lockDigest(tx: Transaction, sha256: string): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${sha256}, 0))`,
	);
}
