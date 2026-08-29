import { chromium } from "@playwright/test";

/**
 * Photographs the link-preview card into `apps/web/public/og.png`.
 *
 * `npm run generate:og` from the repository root, with `npm run dev:web`
 * already running — same arrangement as the other shot scripts here, and for
 * the same reason: the dev server is what compiles the app's stylesheet and
 * serves its self-hosted fonts, which is the entire point of shooting the card
 * in a browser instead of drawing it as an SVG.
 *
 * Run it whenever the card, the tokens or the wordmark change, and commit the
 * PNG. Nothing generates this at build time — a crawler asks for one static
 * file and will not wait for a render.
 */

const ORIGIN = process.env.WEB_ORIGIN ?? "https://localhost:5173";
const OUT = process.argv[2] ?? "apps/web/public/og.png";

// 1200×630 is what every platform crops toward; at 2× the wordmark survives a
// retina chat window, and this compresses to a fraction of the size cap.
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const browser = await chromium.launch();
const context = await browser.newContext({
	ignoreHTTPSErrors: true,
	// Roomier than the card, which sits centred with a margin so it can be
	// looked at in a browser while it is being designed. The shot is of the
	// element, not the viewport, so the slack costs nothing.
	viewport: { width: WIDTH + 200, height: HEIGHT + 200 },
	deviceScaleFactor: SCALE,
	// The card is dark in every chat, light or dark: a preview is a picture, not
	// a themed surface, and it lands on whatever background the reader's client
	// paints. `ThemeScript` reads this key before the first paint.
	storageState: {
		cookies: [],
		origins: [
			{
				origin: ORIGIN,
				localStorage: [{ name: "zero-lag:theme", value: "dark" }],
			},
		],
	},
});

const page = await context.newPage();

try {
	await page.goto(`${ORIGIN}/og`, { waitUntil: "networkidle" });
} catch (cause) {
	await browser.close();
	console.error(
		`Could not reach ${ORIGIN}/og — is \`npm run dev:web\` running?\n${cause}`,
	);
	process.exit(1);
}

const card = page.getByTestId("og-card");
await card.waitFor();
// Variable fonts arrive after first paint, and a card shot in the fallback
// face is wrong in a way that looks like a design decision.
await page.evaluate(() => document.fonts.ready.then(() => undefined));

await card.screenshot({ path: OUT, scale: "device" });
await browser.close();

console.log(`og card → ${OUT} (${WIDTH * SCALE}×${HEIGHT * SCALE})`);
