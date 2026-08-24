import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? ".";
const shot = async (page, name) =>
	page.screenshot({ path: `${OUT}/${name}.png` });

const browser = await chromium.launch();
const phone = {
	ignoreHTTPSErrors: true,
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	permissions: ["geolocation"],
	geolocation: { longitude: 13.4132, latitude: 52.5219 },
	baseURL: "https://localhost:5173",
};

const host = await browser.newContext(phone);
const page = await host.newPage();
await page.goto("https://localhost:5173/");
await page.evaluate(() => localStorage.setItem("zero-lag:theme", "dark"));
await page.goto("https://localhost:5173/new");

await page.getByTestId("display-name").fill("Pia");
await page.getByTestId("create-confirm").click();

await page.getByTestId("setup-area-district").waitFor();
await page.getByTestId("setup-area-district").click();
await page.getByTestId("area-district-Berlin").waitFor();
await page.getByTestId("area-district-Berlin").click();
await page.getByTestId("area-district-add").click();
await page.getByTestId("area-use").click();
await page.getByTestId("setup-area-chosen").waitFor();
await page.waitForTimeout(1200);
await shot(page, "c2-area");

await page.getByTestId("setup-area-continue").click();
await page.getByTestId("setup-stops-in-play").waitFor();
await page.waitForTimeout(600);
await shot(page, "c3-transit");
await page.getByTestId("mode-bus").click();
await page.waitForTimeout(400);
await shot(page, "c3-transit-bus-off");

await page.getByTestId("setup-transit-continue").click();
await page.getByTestId("hiding-time").waitFor();
await page.waitForTimeout(400);
await shot(page, "c4-size");
await page.getByTestId("hiding-time-up").click();
await page.waitForTimeout(300);
await shot(page, "c4-size-touched");
await page.getByTestId("size-explain").click();
await page.waitForTimeout(800);
await shot(page, "c4b-size-sheet");
await page.keyboard.press("Escape");

await page.getByTestId("setup-size-continue").click();
await page.getByTestId("setup-review").waitFor();
await page.waitForTimeout(600);
await shot(page, "c5-review");

await page.getByTestId("setup-open-lobby").click();
await page.getByTestId("lobby").waitFor();
const code = new URL(page.url()).pathname.split("/")[2];
await page.waitForTimeout(1500);
await shot(page, "a1-host-board-empty");

// A second phone, so the board has something on it.
const other = await browser.newContext(phone);
const ben = await other.newPage();
await ben.goto(`https://localhost:5173/j/${code}`);
await ben.evaluate(() => localStorage.setItem("zero-lag:theme", "dark"));
await ben.goto(`https://localhost:5173/j/${code}`);
await ben.getByTestId("display-name").fill("Nils");
await ben.getByTestId("join-game").click();
await ben.getByTestId("lobby").waitFor();

// Two teams, two sides, both with somebody on them.
for (const [name, side] of [
	["Fuchsbau", "hider"],
	["Eule", "seeker"],
]) {
	await page.getByTestId("create-team").click();
	await page.getByTestId("team-name-input").fill(name);
	await page.waitForTimeout(200);
	if (name === "Fuchsbau") await shot(page, "b1-team-drawer");
	await page.getByTestId(`side-${side}`).click();
	await page.getByTestId("team-editor-done").click();
	await page.waitForTimeout(500);
}

await page.waitForTimeout(600);
await page.getByTestId("player-Pia").click();
await page.getByTestId("move-Pia").click();
await page.waitForTimeout(800);
await shot(page, "b4-pick-team");
await page.getByTestId("join-Eule").click();
await page.waitForTimeout(900);
await shot(page, "a1-one-team-filled");
await ben.getByTestId("team-Fuchsbau").click();
await ben.getByTestId("join-Fuchsbau").click();
await ben.waitForTimeout(900);
await shot(ben, "a2-player-lobby");
await page.waitForTimeout(900);
await shot(page, "a1-host-board");
await page.getByTestId("show-qr").click();
await page.waitForTimeout(900);
await shot(page, "a3-invite");
await page.keyboard.press("Escape");

await page.getByTestId("tab-rules").click();
await page.getByTestId("rules-input").fill(
	"No image searching station names.\nBuses count as transit.",
);
await page.getByTestId("save-rules").click();
await page.waitForTimeout(900);
await shot(page, "rules-tab");
await page.getByTestId("tab-lobby").click();
await page.waitForTimeout(600);
await page.getByTestId("lobby-menu").click();
await page.waitForTimeout(900);
await shot(page, "lobby-menu");
await page.keyboard.press("Escape");

await ben.goto(`https://localhost:5173/g/${code}/briefing`);
await ben.getByTestId("briefing").waitFor();
await ben.waitForTimeout(900);
await shot(ben, "c3-briefing");

await page.goto(`https://localhost:5173/g/${code}/ready`);
await page.getByTestId("ready-check").waitFor();
await page.getByTestId("mark-ready").click();
await page.waitForTimeout(900);
await shot(page, "c1-ready-check");

// Light, so the other half of the token set gets looked at too.
await ben.evaluate(() => localStorage.setItem("zero-lag:theme", "light"));
await ben.goto(`https://localhost:5173/g/${code}`);
await ben.getByTestId("lobby").waitFor();
await ben.waitForTimeout(900);
await shot(ben, "a2-player-lobby-light");

console.log("code", code);
await browser.close();
