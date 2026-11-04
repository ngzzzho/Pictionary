const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const { selectableLocales: locales } = await import("../js/languages.mjs");
  const { catalogs } = await import("../js/localization.mjs");
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const records = [];
  try {
    const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      }),
      p = await c.newPage();
    await p.goto(process.env.TEST_URL);
    await p.locator('[data-action="quick"]').waitFor();
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await c.setOffline(true);
    await p.reload();
    await p.locator('[data-action="settings"]').first().click();
    for (const { code } of locales) {
      await p
        .locator('.settings-language-row[data-action="language-menu"]')
        .click();
      await p.locator(`[data-action="language"][data-value="${code}"]`).click();
      await p.locator('header [data-action="language-back"]').click();
      await p.selectOption("#card-primary", code);
      await p.selectOption("#card-secondary", code === "ar" ? "ja" : "ar");
      await p.evaluate(() => document.fonts.ready);
      await p
        .locator('details[data-disclosure="card-preview"] > summary')
        .click();
      const words = await p
        .locator(".card-language-preview bdi")
        .allTextContents();
      assert.deepEqual(words, [
        catalogs[code].words["w:animals:dog"],
        catalogs[code === "ar" ? "ja" : "ar"].words["w:animals:dog"],
      ]);
      records.push({ code, offline: true, previewMatches: true });
    }
    await p.reload();
    assert.equal(await p.locator("html").getAttribute("lang"), "ar");
    assert.equal(await p.locator("html").getAttribute("dir"), "rtl");
    await c.close();
  } finally {
    await b.close();
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/localization/offline.json",
    JSON.stringify({ records }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ cases: records.length, failures: 0 }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
