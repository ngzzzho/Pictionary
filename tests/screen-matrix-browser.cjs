const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  const failures = [],
    results = [];
  try {
    for (const lang of ["en", "zh"])
      for (const scale of [1, 2]) {
        const c = await b.newContext({
            viewport: { width: 375, height: 667 },
            serviceWorkers: "block",
          }),
          p = await c.newPage();
        await p.addInitScript(
          ({ lang }) => {
            if (!localStorage.sg_v1_profile)
              localStorage.sg_v1_profile = JSON.stringify({
                version: 1,
                language: lang,
                muted: true,
                onboardingSeen: true,
                players: Array.from({ length: 12 }, (_, i) => ({
                  id: String(i),
                  name: "W".repeat(36) + i,
                  team: i % 2,
                })),
                custom: ["W".repeat(30), "蘋果", "月亮", "船", "山"],
                settings: {
                  mode: "teams",
                  surface: "canvas",
                  topic: "custom",
                  difficulty: "general",
                  cardLanguage: "both",
                  seconds: 60,
                  roundsEach: 1,
                },
              });
          },
          { lang },
        );
        await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        await p.locator('[data-action="quick"]').waitFor();
        await p.evaluate((scale) => {
          document.documentElement.style.setProperty(
            "--text-scale",
            String(scale),
          );
          document.documentElement.classList.toggle("large-text", scale > 1.35);
        }, scale);
        const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
        const check = async (screen) => {
          const overflow = await p.evaluate(() => ({
            w: innerWidth,
            scroll: document.documentElement.scrollWidth,
            items: [
              ...document.querySelectorAll("h1,h2,button,nav,.ready-roster"),
            ]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
              .map((e) => e.tagName + ":" + e.textContent.slice(0, 40)),
          }));
          if (overflow.scroll > overflow.w + 1)
            failures.push({ lang, scale, screen, ...overflow });
          results.push({ lang, scale, screen });
        };
        await check("home");
        await click("setup");
        await check("people");
        await click("next-step");
        await check("style");
        await click("next-step");
        await check("cards");
        await click("next-step");
        await check("ready");
        await click("start-game");
        await check("handoff");
        await click("reveal");
        await check("reveal");
        await click("draw");
        await check("drawing");
        await click("judge");
        await check("judgement");
        await click("correct");
        await check("result");
        await click("exit");
        await click("words");
        await check("words");
        await click("home");
        await click("settings");
        await check("settings");
        await c.close();
      }
    console.log(JSON.stringify({ screens: results.length, failures }, null, 2));
    assert.equal(failures.length, 0);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
