// Refinement batch 2 regression: glyph consistency, handoff copy, palette layout, portrait canvas fit, tie line.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
  const checks = [];
  try {
    const c = await b.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const p = await c.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      localStorage.sg_v1_profile = JSON.stringify({
        version: 1,
        language: "en",
        muted: true,
        onboardingSeen: true,
        players: [1, 2, 3].map((i) => ({
          id: String(i),
          name: "Player " + i,
          team: i % 2,
        })),
        custom: [],
        settings: {
          mode: "individual",
          surface: "canvas",
          topic: "mixed",
          difficulty: "easy",
          cardLanguage: "both",
          seconds: 60,
          roundsEach: 1,
        },
      });
    });
    const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
    const startConfiguredGame = async () => {
      await click("setup");
      await p.locator('[data-action="step"][data-step="3"]').click();
      await p.locator('[data-action="start-game"]').click();
    };
    await p.goto(url);
    await click("setup");
    await p.locator('[data-step="2"]').click();
    const topics = await p.locator(".topic").count();
    assert.equal(await p.locator(".topic .pack-icon").count(), topics);
    const glyphs = await p
      .locator(".topic .pack-icon")
      .evaluateAll(
        (els) => new Set(els.map((e) => e.getAttribute("data-asset"))).size,
      );
    assert.equal(glyphs, topics);
    assert.equal(await p.locator(".topic .ui-glyph").count(), 0);
    checks.push("every topic has a distinct approved pack icon");
    await click("home");
    await startConfiguredGame();
    const handoff = await p.locator(".handoff-stage").textContent();
    const secret = "Only the drawer should see the next word.";
    assert.equal(handoff.split(secret).length - 1, 1);
    checks.push("handoff secret hint appears once");
    await click("reveal");
    await click("draw");
    const wrap = await p.locator(".canvas-wrap").boundingBox();
    const canvas = await p.locator("canvas").boundingBox();
    assert.ok(
      Math.abs(wrap.height - canvas.height) < 4 &&
        Math.abs(wrap.width - canvas.width) < 4,
      JSON.stringify({ wrap, canvas }),
    );
    assert.ok(canvas.width >= 340);
    const judge = await p.locator('[data-action="judge"]').boundingBox();
    assert.ok(judge.height >= 60 && judge.y + judge.height <= 844);
    checks.push(
      "portrait square document fills its panel with no letterbox; claim button >=60 and on screen",
    );
    await p.mouse.move(
      canvas.x + canvas.width * 0.2,
      canvas.y + canvas.height * 0.5,
    );
    await p.mouse.down();
    for (let i = 1; i <= 30; i++)
      await p.mouse.move(
        canvas.x + canvas.width * (0.2 + i * 0.02),
        canvas.y + canvas.height * (0.5 + Math.sin(i / 3) * 0.2),
      );
    await p.mouse.up();
    const strokes = await p.evaluate(
      () => JSON.parse(localStorage.sg_v1_game).strokes,
    );
    assert.equal(strokes.length, 1);
    assert.ok(strokes[0].points.length > 5);
    assert.ok(
      strokes[0].points.every(
        (pt) => pt.length === 2 && pt.every((n) => n >= 0 && n <= 1),
      ),
    );
    const pixel = await p.locator("canvas").evaluate((el) => {
      const d = el
        .getContext("2d")
        .getImageData(0, 0, el.width, el.height).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 200) ink++;
      return ink;
    });
    assert.ok(pixel > 100, "smoothed stroke rendered through cached layer");
    checks.push(
      "smoothed rendering keeps the stored stroke schema and paints ink",
    );
    await click("palette");
    assert.equal(
      await p.locator('#palette-dialog [data-action="undo-stroke"]').count(),
      0,
    );
    const tops = await p
      .locator("#palette-dialog .swatch")
      .evaluateAll(
        (els) =>
          new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))
            .size,
      );
    assert.equal(tops, 1);
    assert.equal(await p.locator("#palette-dialog .swatch").count(), 6);
    checks.push(
      "palette shows six colours in one row and no duplicate history tools",
    );
    await click("close-palette");
    assert.equal(await p.locator(".pause-cover > span .pack-icon").count(), 0);
    await click("toggle-pause");
    assert.equal(await p.locator(".pause-cover > span .pack-icon").count(), 1);
    await click("toggle-pause");
    await click("judge");
    await p.locator('[data-action="correct"][data-id="2"]').click();
    assert.equal(await p.locator(".result-emblem .pack-icon").count(), 1);
    checks.push("pause cover and result use pack emblems");
    await click("next-round");
    await click("reveal");
    await click("draw");
    await click("give-up");
    await click("next-round");
    await click("reveal");
    await click("draw");
    await click("give-up");
    await click("next-round");
    const h1 = await p.locator(".celebration h1").textContent();
    const line = await p.locator(".celebration p").textContent();
    assert.equal(h1, "A shared victory!");
    assert.equal(line, "Player 1 · Player 2");
    assert.equal(await p.locator(".recap-mark .pack-icon").count(), 3);
    checks.push("tie names the winners instead of repeating the headline");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log({ status: "pass", checks });
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
