// Layout inspection blocks all licensed image/CSS requests before loading.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const { defaults } = await import("../js/profile.mjs"),
    { newGame, reveal, start, end } = await import("../js/core.mjs");
  const bank = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../js/content.json")),
    ),
    results = [],
    failures = [];
  const dir = process.env.CAPTURE_DIR;
  if (dir) fs.mkdirSync(dir, { recursive: true });
  try {
    for (const language of ["en", "zh"])
      for (const scale of [1, 2, 3.12])
        for (const [width, height] of [
          [320, 568],
          [390, 844],
          [844, 390],
          [667, 375],
        ]) {
          const c = await browser.newContext({
              viewport: { width, height },
              serviceWorkers: "block",
              reducedMotion: "reduce",
            }),
            p = await c.newPage();
          await p.route("**/assets/layerlab/**", (r) => r.abort());
          await p.route("**/css/layerlab-slices.css", (r) =>
            r.fulfill({ contentType: "text/css", body: "" }),
          );
          const profile = {
            version: 1,
            language,
            muted: true,
            onboardingSeen: true,
            players: [
              { id: "a", name: "Mia", team: 0 },
              { id: "b", name: "Leo", team: 1 },
            ],
            custom: ["火龍果", "Music box"],
            settings: { ...defaults, mode: "coop" },
          };
          const game = newGame(
            profile.players,
            profile.settings,
            bank.words.filter((w) => w.status !== "held").slice(0, 12),
          );
          reveal(game);
          start(game);
          game.strokes = [
            {
              color: "#123abc",
              width: 14,
              points: [
                [0.1, 0.2],
                [0.2, 0.3],
                [0.9, 0.8],
              ],
            },
          ];
          end(game, "giveup");
          await p.addInitScript(
            ({ profile, game, scale }) => {
              localStorage.sg_v1_profile = JSON.stringify(profile);
              localStorage.sg_v1_game = JSON.stringify(game);
              document.addEventListener("DOMContentLoaded", () => {
                document.documentElement.style.setProperty(
                  "--text-scale",
                  scale,
                );
                document.documentElement.classList.toggle(
                  "large-text",
                  scale > 1.35,
                );
              });
            },
            { profile, game, scale },
          );
          await p.goto(process.env.TEST_URL);
          await p.addStyleTag({
            content: "*{border-image-source:none!important}",
          });
          async function audit(state) {
            await p.evaluate(() => document.fonts.ready);
            const r = await p.evaluate(() => ({
              overflow: document.documentElement.scrollWidth > innerWidth + 2,
              bad: [
                ...document.querySelectorAll(".shell button:not([disabled])"),
              ]
                .filter((b) => {
                  const r = b.getBoundingClientRect();
                  return (
                    r.width &&
                    r.height &&
                    (r.width < 43 ||
                      r.height < 43 ||
                      r.right > innerWidth + 2 ||
                      r.left < -2)
                  );
                })
                .map((b) => ({
                  action: b.dataset.action,
                  text: b.textContent,
                  width: b.getBoundingClientRect().width,
                  height: b.getBoundingClientRect().height,
                })),
              thumbs: document.querySelectorAll(".gallery-thumbnail path")
                .length,
            }));
            results.push({ language, scale, width, height, state, ...r });
            if (r.overflow || r.bad.length) failures.push(results.at(-1));
            if (dir && scale === 1 && (width === 390 || width === 844))
              await p.screenshot({
                path: path.join(dir, `${language}-${width}-${state}.png`),
                fullPage: true,
              });
          }
          await p.locator('[data-action="gallery"]').click();
          await p.waitForSelector('[data-action="gallery-open"]');
          await audit("gallery");
          await p.locator('[data-action="gallery-open"]').first().click();
          await audit("artwork");
          await p.locator('[data-action="close-artwork"]').click();
          await p
            .locator('[data-action="gallery-filter"][data-filter="favourites"]')
            .click();
          await p.waitForFunction(
            () => !document.querySelector('[data-action="gallery-open"]'),
          );
          await audit("favourites-empty");
          await p.locator('[data-action="gallery-back"]').click();
          await p.locator('[data-action="settings"]').first().click();
          await p.locator('[data-action="backup"]').click();
          await audit("backup");
          await p.waitForFunction(() => !document.querySelector('[data-action="backup-pick"]').disabled);
          const payload = {
            raw: { sg_v1_profile: JSON.stringify(profile) },
            inMemory: {},
            artworkArchive: [],
          };
          await p
            .locator("#backup-files")
            .setInputFiles({
              name: "backup.json",
              mimeType: "application/json",
              buffer: Buffer.from(JSON.stringify(payload)),
            });
          await p.waitForSelector(".restore-preview");
          await audit("restore-preview");
          await p.locator('[data-action="backup-cancel"]').click();
          await p
            .locator("#backup-files")
            .setInputFiles({
              name: "damaged.json",
              mimeType: "application/json",
              buffer: Buffer.from("{broken"),
            });
          await p.waitForSelector(".backup-panel .error");
          await audit("restore-error");
          await c.close();
        }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/gallery-restore-layout.json",
    JSON.stringify({ results, failures }, null, 2),
  );
  console.log(JSON.stringify({ cases: results.length, failures }));
  assert.equal(failures.length, 0);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
