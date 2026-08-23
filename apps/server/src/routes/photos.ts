import type { GameContext } from "@zero-lag/schema";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isNodeError, MAX_PHOTO_BYTES, PhotoInputError } from "../photo";
import type { PhotoRow } from "../photo-db";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export interface PhotoRoutesDependencies {
	authenticate(request: Request): Promise<GameContext | null>;
	upload(ctx: GameContext, input: Buffer): Promise<PhotoRow>;
	find(gameId: string, photoId: string): Promise<PhotoRow | null>;
	load(photo: PhotoRow): Promise<Buffer>;
}

export function createPhotosRoute(dependencies: PhotoRoutesDependencies): Hono {
	const route = new Hono();

	route.post(
		"/",
		bodyLimit({
			// The file itself may be exactly 20 MB; multipart framing is separate.
			maxSize: MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES,
			onError: (c) => c.json({ error: "file_too_large" }, 413),
		}),
		async (c) => {
			const ctx = await dependencies.authenticate(c.req.raw);
			if (!ctx) return c.json({ error: "unauthenticated" }, 401);

			const contentType = c.req.header("content-type") ?? "";
			if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
				return c.json({ error: "multipart_required" }, 400);
			}

			let file: File;
			try {
				const form = await c.req.raw.formData();
				const entries = [...form.entries()];
				const entry = entries[0];
				if (
					entries.length !== 1 ||
					entry?.[0] !== "file" ||
					!(entry[1] instanceof File)
				) {
					return c.json({ error: "one_file_required" }, 400);
				}
				file = entry[1];
			} catch {
				return c.json({ error: "invalid_multipart" }, 400);
			}

			if (file.size > MAX_PHOTO_BYTES) {
				return c.json({ error: "file_too_large" }, 413);
			}

			try {
				const photo = await dependencies.upload(
					ctx,
					Buffer.from(await file.arrayBuffer()),
				);
				return c.json(
					{
						id: photo.id,
						sha256: photo.sha256,
						width: photo.width,
						height: photo.height,
					},
					201,
				);
			} catch (error) {
				if (error instanceof PhotoInputError) {
					const status = error.code === "file_too_large" ? 413 : 415;
					return c.json({ error: error.code }, status);
				}
				throw error;
			}
		},
	);

	route.get("/:id", async (c) => {
		const ctx = await dependencies.authenticate(c.req.raw);
		if (!ctx) return c.json({ error: "unauthenticated" }, 401);

		const photo = await dependencies.find(ctx.gameId, c.req.param("id"));
		if (!photo) return c.json({ error: "no_such_photo" }, 404);

		let bytes: Buffer;
		try {
			bytes = await dependencies.load(photo);
		} catch (error) {
			if (isNodeError(error, "ENOENT")) {
				return c.json({ error: "photo_bytes_missing" }, 500);
			}
			throw error;
		}

		return c.body(new Uint8Array(bytes), 200, {
			"Cache-Control": "private, max-age=31536000, immutable",
			"Content-Length": String(bytes.byteLength),
			"Content-Type": photo.contentType,
			ETag: `"${photo.sha256}"`,
		});
	});

	return route;
}
