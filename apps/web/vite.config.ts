import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import mkcert from "vite-plugin-mkcert";
import { VitePWA } from "vite-plugin-pwa";

const require_ = createRequire(import.meta.url);

/**
 * MapLibre's tile worker, emitted next to the bundle.
 *
 * The worker's URL is computed at runtime rather than written as a literal:
 *
 *   const name = url.endsWith("-dev.mjs") ? "…worker-dev.mjs" : "…worker.mjs";
 *   return new URL(`./${name}`, import.meta.url).href;
 *
 * Rollup cannot see through a filename picked by a ternary, so it emits
 * neither file and rewrites nothing. Development is unaffected — the
 * `optimizeDeps.exclude` below serves maplibre from node_modules, where the
 * worker genuinely does sit beside it — which is why this only ever breaks in
 * a production build, where the chunk lands in assets/ on its own.
 *
 * The failure is worse than a 404: the SPA fallback answers the missing file
 * with index.html, so the browser reports "Failed to load module script: The
 * server responded with a non-JavaScript MIME type of text/html", and every
 * vector tile silently never arrives.
 *
 * The shared chunk it imports is emitted too, and unlike the worker it *is*
 * content-hashed. A hash is only useful when every reference to a file can be
 * rewritten to match, which is precisely what the rest of the bundle gets from
 * Vite and what these two are excluded from. But the shared chunk has exactly
 * one reference — `./maplibre-gl-shared.mjs`, inside the worker written out
 * below — and that one is ours to rewrite. So 482 KB of the 500 can be cached
 * immutably, leaving only the 19 KB worker to revalidate.
 */
function maplibreWorkerAssets(): Plugin {
	const WORKER = "maplibre-gl-worker.mjs";
	const SHARED = "maplibre-gl-shared.mjs";
	return {
		name: "zero-lag:maplibre-worker-assets",
		apply: "build",
		generateBundle() {
			// SPA mode still runs a server build; the worker belongs to neither
			// it nor the service worker's precache manifest.
			if (this.environment && this.environment.name !== "client") return;
			const dist = dirname(
				require_.resolve("maplibre-gl/dist/maplibre-gl.mjs"),
			);

			// `name`, not `fileName`: this asks Rollup for a hashed filename
			// instead of dictating one.
			const sharedRef = this.emitFile({
				type: "asset",
				name: SHARED,
				source: readFileSync(join(dist, SHARED)),
			});
			const hashed = `./${basename(this.getFileName(sharedRef))}`;

			const worker = readFileSync(join(dist, WORKER), "utf8");
			const specifier = `./${SHARED}`;
			// Failing loudly matters more here than anywhere else in this file:
			// a silently un-rewritten import produces a worker that 404s on its
			// own dependency, and the visible symptom is a blank map.
			if (!worker.includes(specifier)) {
				this.error(
					`maplibre's worker no longer imports ${specifier}. The hashed ` +
						"shared chunk cannot be wired up; check what this version emits.",
				);
			}

			// Fixed name, alone in the bundle: maplibre builds this URL from a
			// string literal at runtime, so a hash here would simply 404.
			this.emitFile({
				type: "asset",
				fileName: `assets/${WORKER}`,
				source: worker.split(specifier).join(hashed),
			});
		},
	};
}

export default defineConfig(({ mode }) => {
	// HTTPS is the default so a phone on the LAN is a secure context.
	// Only the `dev` command needs the cert; typegen and vitest load this
	// config too, and mkcert probes network interfaces on the way in.
	const https =
		process.env.HTTPS !== "0" &&
		mode !== "test" &&
		process.argv.includes("dev");

	return {
		server: {
			// Phone and tunnel clients talk only to this origin. Hono and
			// zero-cache stay HTTP on loopback; mixed content would block them
			// from HTTPS.
			proxy: {
				"/api": {
					target: "http://localhost:3000",
					ws: true,
				},
				"/zero-cache": {
					target: "http://localhost:4848",
					ws: true,
					rewrite: (path) => path.replace(/^\/zero-cache/, "") || "/",
				},
			},
		},
		resolve: {
			tsconfigPaths: true,
			// Workspace packages and Zero's React entry point can otherwise each
			// pull their own copy of React through the dep optimizer, and the
			// symptom is a null hook dispatcher rather than anything that
			// mentions duplication.
			dedupe: ["react", "react-dom"],
		},
		optimizeDeps: {
			include: ["@rocicorp/zero", "@rocicorp/zero/react", "react", "react-dom"],
			/**
			 * MapLibre loads its tile worker from a blob whose only statement is
			 * `import "<new URL('maplibre-gl-worker.mjs', import.meta.url)>"`.
			 * Prebundled into `.vite/deps`, that URL resolves next to the bundle,
			 * where the worker file is not — so the worker starts, its import
			 * 404s, and every vector tile request hangs forever with no error
			 * event. The symptom is a correctly sized map showing nothing but
			 * the style's background colour.
			 */
			exclude: ["maplibre-gl"],
		},
		plugins: [
			tailwindcss(),
			reactRouter(),
			maplibreWorkerAssets(),
			// HTTPS=0 disables it. Turbo only forwards that variable because it
			// is in passThroughEnv.
			...(https ? [mkcert()] : []),
			VitePWA({
				registerType: "autoUpdate",
				// React Router writes the client bundle to build/client, not dist.
				// Without this the service worker precaches an empty directory
				// and the app is installable but useless offline — which is the
				// whole point of it being a PWA.
				outDir: "build/client",
				manifest: {
					name: "zero-lag",
					short_name: "zero-lag",
					description: "Companion app for Jet Lag: Hide + Seek",
					theme_color: "#0c0c0c",
				},
				pwaAssets: { disabled: false, config: true },
				devOptions: { enabled: true },
			}),
		],
	};
});
