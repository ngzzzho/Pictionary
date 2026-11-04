// Isolated synthetic stores only. No screenshots or licensed GUI pixel inspection.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = process.env.TEST_URL || "http://127.0.0.1:8766/";
const check = async (p, fn, arg) => {
  await p.waitForFunction(fn, arg);
};
async function readArchive(p) {
  return p.evaluate(async () => {
    const db = await new Promise((ok, no) => {
      const r = indexedDB.open("sg_artwork_v1");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
    const out = await new Promise((ok, no) => {
      const tx = db.transaction(["drawings", "catalogue"], "readonly");
      const a = tx.objectStore("drawings").getAll(),
        b = tx.objectStore("catalogue").getAll();
      tx.oncomplete = () =>
        ok({ drawings: a.result, catalogue: b.result, version: db.version });
      tx.onabort = () => no(tx.error);
    });
    db.close();
    return out;
  });
}
async function openBackup(p) {
  await p.locator('[data-action="gallery-back"]').click();
  await p.locator('.hero-actions [data-action="settings"]').click();
  await p.locator('[data-action="backup"]').click();
  await p.locator('[data-action="backup-create"]').waitFor();
}
async function chooseBackup(p, files) {
  const opening = p.waitForEvent("filechooser");
  await p.locator('[data-action="backup-pick"]').click();
  await (await opening).setFiles(files);
}
(async () => {
  const engine = process.env.TEST_ENGINE === "webkit" ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const receipts = [],
    contexts = [];
  try {
    const G = await import("../js/core.mjs"),
      { defaults } = await import("../js/profile.mjs");
    const bank = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../js/content.json")),
    );
    const profile = {
      version: 1,
      language: "en",
      muted: true,
      onboardingSeen: true,
      players: [1, 2].map((i) => ({
        id: `synthetic-${i}`,
        name: `Synthetic player ${i}`,
        team: i - 1,
      })),
      custom: ["Synthetic cloud castle", "Synthetic blue boat"],
      settings: {
        ...defaults,
        mode: "coop",
        cardLanguage: "en",
        roundsEach: 3,
      },
    };
    const game = G.newGame(
      profile.players,
      profile.settings,
      bank.words.filter((w) => w.review !== "held" && w.difficulty === "easy"),
      1791880000100,
    );
    const strokes = [
      {
        color: "#243450",
        width: 7,
        points: Array.from({ length: 1100 }, (_, i) => [
          Number((0.1 + i / 1400).toFixed(4)),
          Number((0.4 + Math.sin(i * 0.11) * 0.15).toFixed(4)),
        ]),
      },
      {
        color: "#ffffff",
        width: 24,
        points: [
          [0.5, 0.2],
          [0.5, 0.6],
        ],
      },
    ];
    const drawings = Array.from({ length: 31 }, (_, i) => ({
      version: 1,
      id: `game-${1791880000000 + Math.floor(i / 11) * 1000}:${(i % 11) + 1}`,
      ratio: i % 2 ? 4 / 3 : 1,
      strokes,
    }));
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      acceptDownloads: true,
    });
    contexts.push(c);
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    // Seed old archive v1 before application loading; never touch a normal player context.
    await p.route(base + "?synthetic-seed", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<html><body>synthetic seed</body></html>",
      }),
    );
    await p.goto(base + "?synthetic-seed");
    await p.evaluate(
      async ({ profile, game, drawings }) => {
        localStorage.sg_v1_profile = JSON.stringify(profile);
        localStorage.sg_v1_game = JSON.stringify(game);
        localStorage.pp_custom_words = '["Synthetic legacy word"]';
        const db = await new Promise((ok, no) => {
          const r = indexedDB.open("sg_artwork_v1", 1);
          r.onupgradeneeded = () =>
            r.result.createObjectStore("drawings", { keyPath: "id" });
          r.onsuccess = () => ok(r.result);
          r.onerror = () => no(r.error);
        });
        await new Promise((ok, no) => {
          const tx = db.transaction("drawings", "readwrite");
          for (const r of drawings) tx.objectStore("drawings").put(r);
          tx.oncomplete = ok;
          tx.onabort = () => no(tx.error);
        });
        db.close();
      },
      { profile, game, drawings },
    );
    await p.goto(base);
    await p.locator('[data-action="gallery"]').click();
    await check(
      p,
      () => document.querySelectorAll(".gallery-card").length === 12,
    );
    assert.equal(await p.locator(".gallery-thumbnail").count(), 12);
    await p.locator('[data-action="gallery-more"]').click();
    await check(
      p,
      () => document.querySelectorAll(".gallery-card").length === 24,
    );
    await p.locator('[data-action="gallery-more"]').click();
    await check(
      p,
      () => document.querySelectorAll(".gallery-card").length === 31,
    );
    assert.equal(await p.locator('[data-action="gallery-more"]').count(), 0);
    const upgraded = await readArchive(p);
    assert.equal(upgraded.version, 2);
    assert.deepEqual(
      upgraded.drawings,
      [...drawings].sort((a, b) => a.id.localeCompare(b.id)),
    );
    const favouriteId = await p
      .locator('[data-action="gallery-favourite"]')
      .first()
      .getAttribute("data-id");
    await p.locator('[data-action="gallery-favourite"]').first().click();
    await check(
      p,
      () => !!document.querySelector('.gallery-favourite[aria-pressed="true"]'),
    );
    await p
      .locator('[data-action="gallery-filter"][data-filter="favourites"]')
      .click();
    await check(
      p,
      () => document.querySelectorAll(".gallery-card").length === 1,
    );
    await p.reload();
    await p.locator('[data-action="gallery"]').click();
    await p
      .locator('[data-action="gallery-filter"][data-filter="favourites"]')
      .click();
    await check(
      p,
      () => document.querySelectorAll(".gallery-card").length === 1,
    );
    assert.equal(
      await p.locator('[data-action="gallery-open"]').getAttribute("data-id"),
      favouriteId,
    );
    // Compare exported image to original full-stroke renderer, rather than the sampled recap.
    await p.route("**/__test_artwork.mjs", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: fs
          .readFileSync(path.join(__dirname, "../js/artwork.mjs"), "utf8")
          .replace('"./canvas.mjs"', '"./__test_canvas.mjs"'),
      }),
    );
    await p.route("**/__test_canvas.mjs", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: fs.readFileSync(path.join(__dirname, "../js/canvas.mjs"), "utf8"),
      }),
    );
    const selected = drawings.find((r) => r.id === favouriteId);
    const expected = await p.evaluate(
      async (r) =>
        (await import("./__test_artwork.mjs")).artworkPNG(r.strokes, r.ratio),
      selected,
    );
    await p.locator('[data-action="gallery-open"]').click();
    const download = p.waitForEvent("download");
    await p.locator('[data-action="save-artwork"]').click();
    const png = fs.readFileSync(await (await download).path());
    assert.deepEqual(png, Buffer.from(expected.split(",")[1], "base64"));
    await p.locator('[data-action="close-artwork"]').click();
    receipts.push({
      case: "v1 upgrade / 31 drawings across 3 games / paging / persistent favourite / full PNG",
      pass: true,
    });
    await openBackup(p);
    await p.locator('[data-action="backup-create"]').click();
    await p.locator('[data-action="backup-save"]').first().waitFor();
    const parts = [];
    for (
      let i = 0, count = await p.locator('[data-action="backup-save"]').count();
      i < count;
      i++
    ) {
      const wait = p.waitForEvent("download");
      await p.locator('[data-action="backup-save"]').nth(i).click();
      const d = await wait;
      parts.push({
        name: d.suggestedFilename(),
        mimeType: "application/json",
        buffer: fs.readFileSync(await d.path()),
      });
    }
    // Explicit native export callback states must remain actionable after cancellation.
    await p.evaluate(() => {
      window.backupReply = "cancelled";
      window.webkit = {
        messageHandlers: {
          partyBackup: {
            postMessage: async () => ({ status: window.backupReply }),
          },
        },
      };
    });
    await p.locator('[data-action="backup-save"]').first().click();
    await check(p, () =>
      document.querySelector(".backup-files").textContent.includes("Cancelled"),
    );
    await p.evaluate(() => (window.backupReply = "shared"));
    await p.locator('[data-action="backup-save"]').first().click();
    await check(p, () =>
      document.querySelector(".backup-files").textContent.includes("Exported"),
    );
    const c2 = await browser.newContext({
      viewport: { width: 844, height: 390 },
      serviceWorkers: "block",
      acceptDownloads: true,
    });
    contexts.push(c2);
    const q = await c2.newPage();
    q.on("pageerror", (e) => errors.push(e.message));
    await q.goto(base);
    await q.locator('.hero-actions [data-action="settings"]').click();
    await q.locator('[data-action="backup"]').click();
    await chooseBackup(q, parts);
    await q
      .locator(".restore-preview")
      .waitFor()
      .catch(async (e) => {
        throw new Error(
          e.message +
            "\nBackup text: " +
            (await q.locator(".backup-panel").innerText()),
        );
      });
    assert.equal(
      await q.locator('[data-action="backup-restore"]').isEnabled(),
      true,
    );
    const before = await q.evaluate(() => localStorage.sg_v1_game || null);
    assert.equal(before, null);
    await q.locator('[data-action="backup-restore"]').click();
    await check(q, () =>
      document
        .querySelector(".backup-panel")
        .textContent.includes("Restore complete"),
    );
    const restored = await q.evaluate(() => ({
      profile: JSON.parse(localStorage.sg_v1_profile),
      game: JSON.parse(localStorage.sg_v1_game),
      legacy: localStorage.getItem("pp_custom_words"),
      marker: localStorage.sg_restore_pending || null,
    }));
    assert.deepEqual(restored.profile, profile);
    assert.deepEqual(restored.game, game);
    assert.equal(restored.legacy, null);
    assert.equal(restored.marker, null);
    const restoredArchive = await readArchive(q);
    assert.deepEqual(restoredArchive.drawings, upgraded.drawings);
    assert.equal(
      restoredArchive.catalogue.find((r) => r.id === favouriteId).favourite,
      true,
    );
    await q.locator('[data-action="home"]').click();
    await q.locator('.hero-actions [data-action="settings"]').click();
    await q.locator('[data-action="backup"]').click();
    await chooseBackup(q, parts);
    await q.locator(".restore-preview").waitFor();
    const counts = await q.locator(".backup-summary dd").allTextContents();
    assert.equal(counts[2], "0");
    assert.equal(counts[3], "31");
    await q.locator('[data-action="backup-restore"]').click();
    await check(q, () =>
      document
        .querySelector(".backup-panel")
        .textContent.includes("Restore complete"),
    );
    assert.deepEqual((await readArchive(q)).drawings, upgraded.drawings);
    assert.deepEqual(errors, []);
    receipts.push({
      case: "backup parts download / native cancel+shared / empty-device restore / full readback / duplicate restore",
      parts: parts.length,
      pass: true,
    });
  } finally {
    for (const c of contexts) await c.close();
    await browser.close();
  }
  fs.writeFileSync(
    process.env.RECEIPT || `../v1-checks/gallery-restore-${engine}.json`,
    JSON.stringify({ engine, records: receipts }, null, 2),
  );
  console.log({ engine, passed: receipts.length });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
