const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
  });
  try {
    const c = await b.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      }),
      p = await c.newPage();
    await p.goto(process.env.TEST_URL);
    await p.locator('[data-action="quick"]').click();
    await p.locator('[data-action="intro-start"]').click();
    let firstKey, original;
    for (let game = 0; game < 3; game++) {
      for (let round = 0; round < 6; round++) {
        await p.locator('[data-action="reveal"]').click();
        await p.locator('[data-action="draw"]').click();
        const r = await p.locator("#drawing-canvas").boundingBox();
        await p.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.3);
        await p.mouse.down();
        await p.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.6, {
          steps: 20,
        });
        await p.mouse.up();
        await p.locator('[data-action="give-up"]').click();
        if (game === 0 && round === 0) {
          firstKey = await p.evaluate(
            () => JSON.parse(localStorage.sg_v1_game).id + ":1",
          );
          await p.locator('[data-action="open-artwork"]').click();
          const event = p.waitForEvent("download");
          await p.locator('[data-action="save-artwork"]').click();
          original = fs.readFileSync(await (await event).path());
          await p.locator('[data-action="close-artwork"]').click();
        }
        await p.locator('[data-action="next-round"]').click();
      }
      await p.locator(".screen-final").waitFor();
      if (game < 2) await p.locator('[data-action="replay"]').click();
    }
    await p.locator('[data-action="home"]').last().click();
    await p.reload();
    await p.locator('[data-action="gallery"]').click();
    await p.waitForFunction(
      () =>
        document.querySelectorAll('[data-action="gallery-open"]').length === 12,
    );
    await p.locator('[data-action="gallery-more"]').click();
    await p.waitForFunction(
      () =>
        document.querySelectorAll('[data-action="gallery-open"]').length === 18,
    );
    await p
      .locator(`[data-action="gallery-open"][data-id="${firstKey}"]`)
      .click();
    const event = p.waitForEvent("download");
    await p.locator('[data-action="save-artwork"]').click();
    assert.deepEqual(fs.readFileSync(await (await event).path()), original);
    const result = {
      completedGames: 3,
      completedDrawingRounds: 18,
      firstDrawingDiscoverableAfterReload: true,
      firstPNGByteIdentical: true,
    };
    fs.writeFileSync(
      "../v1-checks/gallery-restore-three-games.json",
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
