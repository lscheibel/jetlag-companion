import { chromium } from "@playwright/test";
const OUT = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({
	ignoreHTTPSErrors: true,
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	permissions: ["geolocation"],
	geolocation: { longitude: 13.4132, latitude: 52.5219 },
});
const page = await ctx.newPage();
await page.goto("https://localhost:5173/");
await page.evaluate(() => localStorage.setItem("zero-lag:theme", "dark"));
await page.goto("https://localhost:5173/new");
await page.getByTestId("display-name").fill("Pia");
await page.getByTestId("own-copy").click();
await page.getByTestId("create-confirm").click();
await page.getByTestId("setup-area-district").waitFor();
await page.getByTestId("setup-area-district").click();
await page.getByTestId("area-district-Berlin").waitFor();
await page.getByTestId("area-district-Berlin").click();
await page.getByTestId("area-district-add").click();
await page.getByTestId("area-use").click();
await page.getByTestId("setup-area-chosen").waitFor();
await page.waitForTimeout(1000);
await page.getByTestId("setup-area-continue").click();
await page.getByTestId("setup-stops-in-play").waitFor();
await page.getByTestId("setup-transit-continue").click();
await page.getByTestId("hiding-time").waitFor();
await page.getByTestId("setup-size-continue").click();
await page.getByTestId("setup-review").waitFor();
await page.getByTestId("setup-open-lobby").click();
await page.getByTestId("lobby").waitFor();
await page.waitForTimeout(1500);
await page.getByTestId("lobby-menu").click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/menu-cta.png` });
// Four frames across one sweep, to see the light actually move.
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
for (const [i, wait] of [0, 900, 900, 900].entries()) {
	await page.waitForTimeout(wait);
	await page.locator('[data-testid="read-briefing"]').screenshot({
		path: `${OUT}/sheen-${i}.png`,
	});
}
await browser.close();
