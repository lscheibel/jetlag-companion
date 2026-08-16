import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		// Workspace packages and Zero's React entry point can otherwise each pull
		// their own copy of React through the dep optimizer, and the symptom is a
		// null hook dispatcher rather than anything that mentions duplication.
		dedupe: ["react", "react-dom"],
	},
	optimizeDeps: {
		include: ["@rocicorp/zero", "@rocicorp/zero/react", "react", "react-dom"],
	},
	plugins: [
		tailwindcss(),
		reactRouter(),
		VitePWA({
			registerType: "autoUpdate",
			// React Router writes the client bundle to build/client, not dist.
			// Without this the service worker precaches an empty directory and the
			// app is installable but useless offline — which is the whole point of
			// it being a PWA.
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
});
