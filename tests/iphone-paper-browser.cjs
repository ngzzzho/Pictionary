const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const results = [];
  try {
    for (const lang of ["en", "zh"])
      for (const [width, height, insets] of [
        [320, 568, { top: 20, bottom: 0, left: 0, right: 0 }],
        [390, 844, { top: 47, bottom: 34, left: 0, right: 0 }],
        [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }],
        [667, 375, { top: 0, bottom: 0, left: 0, right: 0 }],
      ]) {
        const c = await b.newContext({
            viewport: { width, height },
            serviceWorkers: "block",
            reducedMotion: "reduce",
          }),
          p = await c.newPage();
        const cdp = await c.newCDPSession(p);
        await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
        await p.addInitScript((lang) => {
          localStorage.sg_v1_profile = JSON.stringify({
            version: 1,
            language: lang,
            muted: true,
            onboardingSeen: false,
            players: [1, 2].map((i) => ({
              id: String(i),
              name: "Player " + i,
              team: i % 2,
            })),
            custom: [],
            settings: {
              mode: "coop",
              surface: "paper",
              topic: "mixed",
              difficulty: "easy",
              cardLanguage: "both",
              seconds: 60,
              roundsEach: 1,
            },
          });
        }, lang);
        await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
        await click("setup");
        await p.locator('[data-action="step"][data-step="3"]').click();
        await click("start-game");
        if (width > height) {
          const r = await p
            .locator('[data-action="intro-start"]')
            .boundingBox();
          assert.ok(
            r.y + r.height <= height - insets.bottom + 1,
            JSON.stringify({ lang, width, height, intro: r }),
          );
        }
        await click("intro-start");
        await click("reveal");
        await click("draw");
        assert.equal(await p.locator("canvas").count(), 0);
        assert.equal(await p.locator(".compact-tools").count(), 0);
        for (const state of ["running", "paused"]) {
          if (state === "paused") await click("toggle-pause");
          await p.evaluate(() => scrollTo(0, 0));
          for (const s of [
            ".paper-stage",
            '[data-action="judge"]',
            '[data-action="give-up"]',
          ]) {
            const r = await p.locator(s).boundingBox();
            assert.ok(
              r.width >= (s === ".paper-stage" ? 150 : 44) &&
                r.height >= 44 &&
                r.x >= insets.left - 1 &&
                r.x + r.width <= width - insets.right + 1 &&
                r.y + r.height <= height - insets.bottom + 1,
              JSON.stringify({ lang, width, height, state, s, r }),
            );
          }
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
        }
        await click("judge");
        await click("correct");
        assert.equal(await p.locator(".result-correct").count(), 1);
        results.push({ lang, width, height, status: "pass" });
        await c.close();
      }
  } finally {
    await b.close();
  }
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
