// Isolated offline distribution check. No screenshots or licensed pixel inspection.
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
  try {
    const context = await browser.newContext();
    let page = await context.newPage();
    const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
    const manifest = JSON.parse(
      fs.readFileSync(
        require("node:path").join(__dirname, "../scripts/layerlab-assets.json"),
        "utf8",
      ),
    );
    const characters = JSON.parse(
      fs.readFileSync(
        require("node:path").join(
          __dirname,
          "../scripts/character-assets.json",
        ),
        "utf8",
      ),
    );
    const scenes = JSON.parse(
      fs.readFileSync(
        require("node:path").join(__dirname, "../scripts/scene-assets.json"),
        "utf8",
      ),
    );
    const fonts = JSON.parse(
      fs.readFileSync(
        require("node:path").join(__dirname, "../scripts/font-assets.json"),
        "utf8",
      ),
    );
    const allAssets = [...manifest, ...characters, ...scenes, ...fonts];
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.close();
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(url);
    await page.locator('[data-action="quick"]').waitFor();
    const results = await page.evaluate(async (manifest) => {
      const records = [];
      for (const asset of manifest) {
        const response = await fetch(asset.file);
        const data = await response.arrayBuffer();
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        ]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        records.push({
          file: asset.file,
          status: response.status,
          bytes: data.byteLength,
          hash,
        });
      }
      return records;
    }, allAssets);
    for (let i = 0; i < allAssets.length; i++) {
      assert.equal(results[i].status, 200);
      assert.equal(results[i].bytes, allAssets[i].bytes);
      assert.equal(results[i].hash, allAssets[i].sha256);
    }
    const css = await page.evaluate(async () => {
      const r = await fetch("css/layerlab-slices.css");
      return { status: r.status, text: await r.text() };
    });
    assert.equal(css.status, 200);
    assert.ok(css.text.includes("manifest-sha256:"));
    const motion = await page.evaluate(async () => {
      const r = await fetch("css/motion.css");
      return { status: r.status, text: await r.text() };
    });
    assert.equal(motion.status, 200);
    assert.ok(motion.text.includes("prefers-reduced-motion: reduce"));
    const phone = await page.evaluate(async () => {
      const r = await fetch("css/iphone-ux.css");
      return { status: r.status, text: await r.text() };
    });
    assert.equal(phone.status, 200);
    assert.ok(phone.text.includes("Phone review:"));
    const gameUi = await page.evaluate(async () => {
      const r = await fetch("css/game-ui.css");
      return { status: r.status, text: await r.text() };
    });
    assert.equal(gameUi.status, 200);
    assert.ok(gameUi.text.includes("Drawing clubhouse"));
    console.log({
      offlineColdStart: true,
      licensedAssetsVerified: manifest.length,
      originalCharactersVerified: characters.length,
      sceneAssetsVerified: scenes.length,
      fontAndLicenseAssetsVerified: fonts.length,
      generatedSlicesAvailable: true,
      motionAvailable: true,
      phoneLayoutsAvailable: true,
      gameUiAvailable: true,
    });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
