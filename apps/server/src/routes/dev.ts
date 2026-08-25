import { Hono } from "hono";
import { z } from "zod";
import { sceneById, sceneSummaries } from "../dev/scenes";

const spawnBody = z.object({
	deviceId: z.string().min(1),
});

/**
 * DEV-only scene catalog. Mounted from the server entry when `NODE_ENV` is not
 * production; a production process that somehow receives these paths 404s
 * because the route is not there at all.
 */
export function createDevRoutes(): Hono {
	const dev = new Hono();

	dev.get("/scenes", (c) => c.json({ scenes: sceneSummaries() }));

	dev.post("/scenes/:id", async (c) => {
		const parsed = spawnBody.safeParse(await c.req.json());
		if (!parsed.success) {
			return c.json(
				{ error: "invalid_body", issues: parsed.error.issues },
				400,
			);
		}
		const id = c.req.param("id");
		if (!sceneById(id)) {
			return c.json({ error: "no_such_scene" }, 404);
		}

		const { spawnScene } = await import("../dev/spawn");
		const spawned = await spawnScene(id, parsed.data.deviceId);
		if (!spawned) return c.json({ error: "no_such_scene" }, 404);
		return c.json(spawned);
	});

	return dev;
}

export function mountDevRoutes(app: Hono, nodeEnv: string): void {
	if (nodeEnv === "production") return;
	app.route("/api/dev", createDevRoutes());
}
