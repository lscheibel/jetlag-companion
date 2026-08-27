import { serve } from "@hono/node-server";
import { env } from "@zero-lag/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { contextFromRequest } from "./auth";
import { loadBoundaries } from "./boundaries";
import { loadCatalog } from "./catalog";
import { db } from "./db";
import { attachEphemeralChannel } from "./ephemeral";
import { processPhoto } from "./photo";
import { findPhotoForGame, loadPhotoBytes, savePhotoUpload } from "./photo-db";
import { loadPois } from "./pois";
import { catalog } from "./routes/catalog";
import { mountDevRoutes } from "./routes/dev";
import { games } from "./routes/games";
import { gameMaps, maps } from "./routes/maps";
import { createPhotosRoute } from "./routes/photos";
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
app.route("/api/games", gameMaps);
app.route("/api/maps", maps);
app.route("/api/catalog", catalog);
app.route(
	"/api/photos",
	createPhotosRoute({
		authenticate: contextFromRequest,
		upload: async (ctx, input) => {
			const processed = await processPhoto(input);
			return savePhotoUpload(db, env.PHOTOS_PATH, ctx, processed);
		},
		find: (gameId, photoId) => findPhotoForGame(db, gameId, photoId),
		load: (photo) => loadPhotoBytes(env.PHOTOS_PATH, photo),
	}),
);
app.route("/api/zero", zero);
mountDevRoutes(app, env.NODE_ENV);

// Read once, at startup rather than on the first request, so a missing
// artifact is a line in the boot log instead of a slow first builder open.
loadCatalog();
loadBoundaries();
loadPois();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`server listening on http://localhost:${info.port}`);
});

attachEphemeralChannel(server as never, "/api/ephemeral");
