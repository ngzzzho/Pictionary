// Geometry/text only: never screenshot or decode licensed asset pixels.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const result = [];
  try {
    for (const lang of ["en", "zh"])
      for (const [width, height] of [
        [320, 568],
        [375, 667],
        [390, 844],
        [844, 390],
        [1024, 768],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.addInitScript((lang) => {
          localStorage.sg_v1_profile = JSON.stringify({
            version: 1,
            language: lang,
            muted: true,
            onboardingSeen: true,
            players: [1, 2, 3].map((i) => ({
              id: String(i),
              name: "Player " + i,
              team: i % 2,
            })),
            custom: ["Moon", "Apple", "House", "Cat", "Sun"],
            settings: {
              mode: "individual",
              surface: "canvas",
              topic: "custom",
              difficulty: "easy",
              cardLanguage: "both",
              seconds: 60,
              roundsEach: 1,
            },
          });
        }, lang);
        const click = (a) =>
          page.locator(`[data-action="${a}"]`).first().click();
        const record = async (screen, selector) => {
          await page.evaluate(() => window.scrollTo(0, 0));
          result.push({
            lang,
            width,
            height,
            screen,
            ...(await page.evaluate((selector) => {
              const rect = document
                .querySelector(selector)
                .getBoundingClientRect();
              return {
                ctaBottom: Math.round(rect.bottom),
                ctaHeight: Math.round(rect.height),
                onScreen: rect.bottom <= innerHeight,
                scrollHeight: document.documentElement.scrollHeight,
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
              };
            }, selector)),
          });
        };
        await page.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        await page.evaluate(() => document.fonts.ready);
        await record("home", '[data-action="quick"]');
        await click("quick");
        await click("reveal");
        await click("draw");
        const r = await page.locator("canvas").boundingBox();
        await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.7, {
          steps: 10,
        });
        await page.mouse.up();
        await click("judge");
        await click("correct");
        await record("result", '[data-action="next-round"]');
        page.once("dialog", (d) => d.accept());
        await click("finish");
        await record("final", '[data-action="replay"]');
        await context.close();
      }
    if (process.env.RECEIPT)
      fs.writeFileSync(
        process.env.RECEIPT,
        JSON.stringify(result, null, 2) + "\n",
      );
    assert.deepEqual(
      result.filter((r) => !r.onScreen || r.overflow || r.ctaHeight < 58),
      [],
      "Primary actions should fit without scrolling at default text scale",
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
