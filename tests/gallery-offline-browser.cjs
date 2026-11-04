const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
  });
  try {
    const c = await b.newContext(),
      p = await c.newPage();
    await p.goto(process.env.TEST_URL);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await p.locator('[data-action="quick"]').click();
    if (await p.locator('[data-action="intro-start"]').count())
      await p.locator('[data-action="intro-start"]').click();
    await p.locator('[data-action="reveal"]').click();
    await p.locator('[data-action="draw"]').click();
    const box = await p.locator("#drawing-canvas").boundingBox();
    await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
      steps: 40,
    });
    await p.mouse.up();
    await p.locator('[data-action="give-up"]').click();
    await p.locator('[data-action="open-artwork"]').click();
    let download = p.waitForEvent("download");
    await p.locator('[data-action="save-artwork"]').click();
    const original = fs.readFileSync(await (await download).path());
    await p.locator('[data-action="close-artwork"]').click();
    await p.locator('[data-action="exit"]').click();
    await p.close();
    await c.setOffline(true);
    const q = await c.newPage();
    await q.goto(process.env.TEST_URL);
    await q.locator('[data-action="gallery"]').click();
    await q.locator('[data-action="gallery-open"]').first().click();
    download = q.waitForEvent("download");
    await q.locator('[data-action="save-artwork"]').click();
    assert.deepEqual(fs.readFileSync(await (await download).path()), original);
    await q.locator('[data-action="close-artwork"]').click();
    await q.locator('[data-action="gallery-back"]').click();
    await q.locator('[data-action="settings"]').first().click();
    await q.locator('[data-action="backup"]').click();
    await q.locator('[data-action="backup-create"]').click();
    download = q.waitForEvent("download");
    await q.locator('[data-action="backup-save"]').first().click();
    const file = await download;
    assert.ok(fs.statSync(await file.path()).size > 1000);
    const result = {
      offlineColdStart: true,
      firstArtworkFullPNGUnchanged: true,
      backupPreparedAndExportedOffline: true,
    };
    fs.writeFileSync(
      "../v1-checks/gallery-restore-offline-flow.json",
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
