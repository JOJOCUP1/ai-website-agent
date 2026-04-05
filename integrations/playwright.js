// integrations/playwright.js — Auto screenshot after deploy
const path = require("path");
const { log } = require("../modules/logger");

const SCREENSHOT_PATH = path.join(__dirname, "../data/screenshot.png");

async function takeScreenshot(url) {
  if (!url) return null;

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    log.warn("Playwright not installed — screenshots disabled. Run: npm install playwright && npx playwright install chromium");
    return null;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    log.info(`Screenshot saved: ${SCREENSHOT_PATH}`);
    return SCREENSHOT_PATH;
  } catch (e) {
    log.error("Screenshot failed:", e.message);
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { takeScreenshot, SCREENSHOT_PATH };
