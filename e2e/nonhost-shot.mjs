import { chromium } from "@playwright/test";
const OUT = process.argv[2];
const browser = await chromium.launch();
const phone = {
	ignoreHTTPSErrors: true,
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	permissions: ["geolocation"],
	geolocation: { longitude: 13.4132, latitude: 52.5219 },
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
await page.waitForTimeout(1000);
await page.getByTestId("setup-area-continue").click();
await page.getByTestId("setup-stops-in-play").waitFor();
await page.getByTestId("setup-transit-continue").click();
await page.getByTestId("hiding-time").waitFor();
await page.getByTestId("setup-size-continue").click();
await page.getByTestId("setup-review").waitFor();
await page.getByTestId("setup-open-lobby").click();
await page.getByTestId("lobby").waitFor();
const code = new URL(page.url()).pathname.split("/")[2];

const other = await browser.newContext(phone);
const ben = await other.newPage();
await ben.goto(`https://localhost:5173/j/${code}`);
await ben.evaluate(() => localStorage.setItem("zero-lag:theme", "dark"));
await ben.goto(`https://localhost:5173/j/${code}`);
await ben.getByTestId("display-name").fill("Nils");
await ben.getByTestId("join-game").click();
await ben.getByTestId("lobby").waitFor();
await ben.waitForTimeout(1200);

await ben.getByTestId("lobby-menu").click();
await ben.waitForTimeout(900);
await ben.screenshot({ path: `${OUT}/nonhost-menu.png` });
const closeCount = await ben.getByTestId("lobby-menu-sheet-close").count();
const sheetHtml = await ben.getByTestId("lobby-menu-sheet").innerHTML();
console.log("close buttons:", closeCount);
console.log("has svg title Close:", sheetHtml.includes(">Close<"));
await browser.close();
