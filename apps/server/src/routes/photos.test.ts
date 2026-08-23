import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { PhotoRow } from "../photo-db";
import { createPhotosRoute } from "./photos";

const ctx = {
	playerId: "player-1",
	gameId: "game-1",
	deviceId: "device-1",
};

const row: PhotoRow = {
	id: "photo-1",
	gameId: "game-1",
	sha256: "a".repeat(64),
	contentType: "image/jpeg",
	byteSize: 4,
	width: 2,
	height: 2,
	uploadedByPlayerId: "player-1",
	uploadedAt: 1,
};

function app(overrides: Partial<Parameters<typeof createPhotosRoute>[0]> = {}) {
	const route = createPhotosRoute({
		authenticate: async () => ctx,
		upload: async () => row,
		find: async () => row,
		load: async () => Buffer.from("JPEG"),
		...overrides,
	});
	return new Hono().route("/api/photos", route);
}

describe("photo HTTP routes", () => {
	it("rejects an unauthenticated upload", async () => {
		const response = await app({
			authenticate: async () => null,
		}).request("/api/photos", { method: "POST" });
		expect(response.status).toBe(401);
	});

	it("requires a single multipart file named file", async () => {
		const response = await app().request("/api/photos", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "multipart_required" });
	});

	it("returns metadata after a successful upload", async () => {
		const form = new FormData();
		form.set("file", new File([new Uint8Array([1, 2, 3])], "found.jpg"));
		const response = await app().request("/api/photos", {
			method: "POST",
			body: form,
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			id: "photo-1",
			sha256: row.sha256,
			width: 2,
			height: 2,
		});
	});

	it("serves bytes with a long private cache header", async () => {
		const response = await app().request("/api/photos/photo-1");
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe(
			"private, max-age=31536000, immutable",
		);
		expect(response.headers.get("content-type")).toBe("image/jpeg");
		expect(await response.text()).toBe("JPEG");
	});

	it("404s a photo from another game", async () => {
		const response = await app({
			find: async () => null,
		}).request("/api/photos/missing");
		expect(response.status).toBe(404);
	});
});
