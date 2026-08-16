import { serve } from "@hono/node-server";
import { env } from "@zero-lag/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { attachEphemeralChannel } from "./ephemeral";
import { games } from "./routes/games";
import { zero } from "./routes/zero";

const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.get("/health", (c) => c.json({ ok: true }));
app.get("/", (c) => c.text("OK"));

app.route("/api/games", games);
app.route("/api/zero", zero);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`server listening on http://localhost:${info.port}`);
});

attachEphemeralChannel(server as never, "/api/ephemeral");
