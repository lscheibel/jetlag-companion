import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => {
    // HTTPS is the default so a phone on the LAN is a secure context.
    // Only the `dev` command needs the cert; typegen and vitest load this
    // config too, and mkcert probes network interfaces on the way in.
    const https = process.env.HTTPS !== "0" &&
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
