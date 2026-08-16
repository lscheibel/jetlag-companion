import { defineConfig, devices } from "@playwright/test";

/**
 * m0-spec §12: multiple browser contexts, one per phone.
 *
 * Postgres and zero-cache have to be up first — `npm run zero:start` — because
 * zero-cache needs a ten-minute grace period on a cold replica and Playwright's
 * `webServer` timeout is not the place to discover that.
 */
export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: process.env.CI ? "github" : [["list"]],
	use: {
		baseURL: "http://localhost:5173",
		trace: "retain-on-failure",
		...devices["Desktop Chrome"],
		permissions: ["geolocation"],
		// Alexanderplatz, unless a test moves the phone.
		geolocation: { longitude: 13.4132, latitude: 52.5219 },
	},
	webServer: [
		{
			command: "npm run dev --workspace server",
			url: "http://localhost:3000/health",
			cwd: "..",
			reuseExistingServer: true,
			timeout: 60_000,
		},
		{
			command: "npm run dev --workspace web",
			url: "http://localhost:5173",
			cwd: "..",
			reuseExistingServer: true,
			timeout: 60_000,
		},
	],
});
