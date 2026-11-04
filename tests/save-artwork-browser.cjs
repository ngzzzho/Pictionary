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
  const results = [];
  try {
    for (const legacy of [false, true]) {
      const c = await b.newContext({
          serviceWorkers: "block",
          viewport: { width: 390, height: 844 },
        }),
        p = await c.newPage();
      const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
      await click("quick");
      await click("intro-start");
      await click("reveal");
      await click("draw");
      const r = await p.locator("canvas").boundingBox();
      await p.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.2);
      await p.mouse.down();
      await p.mouse.move(r.x + r.width * 0.8, r.y + r.height * 0.8, {
        steps: 15,
      });
      await p.mouse.up();
      await click("exit");
      const stroke = await p.evaluate(
        () => JSON.parse(localStorage.sg_v1_game).strokes,
      );
      if (legacy)
        await p.evaluate(() => {
          const g = JSON.parse(localStorage.sg_v1_game);
          delete g.canvasRatio;
          localStorage.sg_v1_game = JSON.stringify(g);
        });
      await p.reload();
      await click("resume-game");
      assert.equal(await p.locator(".pause-cover").count(), 1);
      for (const [width, height] of [
        [390, 844],
        [844, 390],
        [1024, 768],
      ]) {
        await p.setViewportSize({ width, height });
        await p.waitForTimeout(100);
        const box = await p.locator("canvas").boundingBox();
        assert.ok(
          Math.abs(box.width / box.height - (legacy ? 4 / 3 : 1)) < 0.01,
        );
        assert.deepEqual(
          await p.evaluate(() => JSON.parse(localStorage.sg_v1_game).strokes),
          stroke,
        );
      }
      await click("toggle-pause");
      await click("judge");
      await click("correct");
      assert.equal(await p.locator(".artwork-preview").count(), 1);
      await click("next-round");
      await click("exit");
      await p.reload();
      await click("resume-game");
      assert.equal(await p.locator('[data-action="intro-start"]').count(), 0);
      const history = await p.evaluate(
        () => JSON.parse(localStorage.sg_v1_game).history,
      );
      assert.equal(history[0].canvasRatio, legacy ? 4 / 3 : 1);
      assert.deepEqual(history[0].artwork, stroke);
      assert.deepEqual(errors, []);
      results.push({
        legacy,
        status: "pass",
        checks: [
          "strokes preserved",
          "ratio preserved across three orientations",
          "paused reload",
          "result drawing",
          "recap saved after next round",
          "onboarding not repeated",
        ],
      });
      await c.close();
    }
    console.log(results);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
