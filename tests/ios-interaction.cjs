const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const b = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  try {
    const c = await b.newContext({
        viewport: { width: 844, height: 390 },
        serviceWorkers: "block",
      }),
      p = await c.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const click = (a) => p.locator(`[data-action="${a}"]`).first().click(),
      saved = () => p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
    await click("quick");
    await click("intro-start");
    await click("reveal");
    await click("draw");
    for (const [width, height] of [
      [844, 390],
      [667, 375],
      [320, 568],
      [390, 844],
      [1024, 768],
    ]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(80);
      const metric = await p
        .locator(".compact-tools")
        .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
      assert.ok(
        metric.scroll <= metric.width,
        JSON.stringify({ width, height, metric }),
      );
      for (const a of [
        "palette",
        "eraser",
        "undo-stroke",
        "redo-stroke",
        "clear-canvas",
      ]) {
        const r = await p.locator(`[data-action="${a}"]`).boundingBox();
        assert.ok(r.width >= 44 && r.height >= 44);
        assert.ok(
          r.x >= 0 && r.x + r.width <= width && r.y + r.height <= height,
        );
      }
    }
    await click("palette");
    assert.equal(await p.locator(".pause-cover").count(), 1);
    assert.equal(
      await p.locator("#palette-dialog").evaluate((e) => e.open),
      true,
    );
    await p.locator('[data-action="colour"][data-value="#4589e3"]').click();
    await p.locator('[data-action="brush"][data-value="14"]').click();
    await click("close-palette");
    assert.equal(await p.locator(".pause-cover").count(), 0);
    await click("toggle-pause");
    await click("palette");
    await p.keyboard.press("Escape");
    assert.equal(await p.locator(".pause-cover").count(), 1);
    await click("toggle-pause");
    await click("palette");
    await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert.equal(await p.locator("#palette-dialog").count(), 0);
    assert.equal(await p.locator(".pause-cover").count(), 1);
    await click("uncover");
    assert.equal(await p.locator(".pause-cover").count(), 1);
    assert.deepEqual(errors, []);
    await p.evaluate(() => {
      document.documentElement.style.setProperty("--text-scale", "2");
      document.documentElement.classList.add("large-text");
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(150);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.ok((await p.locator("canvas").boundingBox()).height >= 200);
    await click("palette");
    assert.ok(await p.locator('[data-action="close-palette"]').isVisible());
    await click("close-palette");
    const result = {
      status: "pass",
      largeTypeReflow: true,
      viewports: 5,
      checks: [
        "all five tools visible and >=44",
        "palette freezes time",
        "resume preserves prior running state",
        "Escape preserves prior pause",
        "background closes palette without autoresume",
      ],
      errors,
    };
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
