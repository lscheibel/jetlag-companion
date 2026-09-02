import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The preview's static server. `node tools/map-style/serve.mjs`, then open
 * http://localhost:8099/preview.html.
 *
 * No dependency and no dev server: `preview.html` is two MapLibre maps side by
 * side, ours against the upstream style it came from, so a palette change can
 * be judged against what it is a change *from*. MapLibre itself is served
 * straight out of node_modules — the app's own copy, so the preview cannot
 * disagree with the app about what a style means.
 */
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const MAPLIBRE = fileURLToPath(
	new URL("../../node_modules/maplibre-gl/dist/", import.meta.url),
);
const PORT = 8099;

const TYPES = {
	".html": "text/html; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".map": "application/json; charset=utf-8",
};

createServer((request, response) => {
	const path = normalize(decodeURI(new URL(request.url, "http://x").pathname));
	const file = path.startsWith("/maplibre/")
		? join(MAPLIBRE, path.slice("/maplibre/".length))
		: join(ROOT, path);

	// normalize() has already collapsed any `..`, so anything outside is a miss.
	if (
		(!file.startsWith(ROOT) && !file.startsWith(MAPLIBRE)) ||
		!existsSync(file) ||
		!statSync(file).isFile()
	) {
		response.writeHead(404).end("not found");
		return;
	}

	response.writeHead(200, {
		"content-type": TYPES[extname(file)] ?? "application/octet-stream",
		"cache-control": "no-store",
	});
	createReadStream(file).pipe(response);
}).listen(PORT, () => {
	console.log(`http://localhost:${PORT}/preview.html`);
});
