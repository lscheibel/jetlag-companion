import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { SCENES } from "../dev/scenes";
import { createDevRoutes, mountDevRoutes } from "./dev";

describe("dev scene routes", () => {
	it("404s when NODE_ENV is production", async () => {
		const app = new Hono();
		mountDevRoutes(app, "production");
		const response = await app.request("/api/dev/scenes");
		expect(response.status).toBe(404);
		const post = await app.request("/api/dev/scenes/solo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ deviceId: "device-1" }),
		});
		expect(post.status).toBe(404);
	});

	it("lists every catalog scene when mounted", async () => {
		const app = new Hono();
		mountDevRoutes(app, "development");
		const response = await app.request("/api/dev/scenes");
		expect(response.status).toBe(200);
		const body: unknown = await response.json();
		expect(body).toEqual({
			scenes: SCENES.map(({ id, group, label, hint }) => ({
				id,
				group,
				label,
				hint,
			})),
		});
	});

	it("rejects an unknown scene without touching the database", async () => {
		const response = await createDevRoutes().request("/scenes/nope", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ deviceId: "device-1" }),
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "no_such_scene" });
	});

	it("rejects a spawn with no device id", async () => {
		const response = await createDevRoutes().request("/scenes/solo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "invalid_body" });
	});
});
