// Isolated synthetic data; pixel assertions inspect only our own canvas exports, never GUI assets.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const safari = process.env.TEST_ENGINE === "webkit";
  const browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const records = [];
  // Cross-layer contract: every real PNG produced below must pass the native size gate.
  const nativeSource = fs.readFileSync(path.join(__dirname, "../ios/App/App/SceneDelegate.swift"), "utf8");
  const acceptedHeights = nativeSource.match(/\[([0-9, ]+)\]\.contains\(height\)/)[1].split(",").map(Number);
  assert.ok(acceptedHeights.includes(1200), "legacy artwork remains supported");
  assert.ok(acceptedHeights.includes(1600), "branded landscape supported");
  assert.ok(acceptedHeights.includes(2000), "branded square supported");
  const G = await import("../js/core.mjs");
  const bank = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../js/content.json")),
  );
  const strokes = [
    {
      color: "#e96455",
      width: 14,
      points: [
        [0.15, 0.4],
        [0.85, 0.4],
      ],
    },
    {
      color: "#ffffff",
      width: 24,
      points: [
        [0.5, 0.3],
        [0.5, 0.5],
      ],
    },
    { color: "#367bb5", width: 14, points: [[0.25, 0.7]] },
    {
      color: "#243450",
      width: 7,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.1],
        [0.4, 0.2],
      ],
    },
  ];
  strokes.push({
    color: "#243450",
    width: 3,
    points: Array.from({ length: 1100 }, (_, i) => [
      Number((0.1 + i / 1400).toFixed(4)),
      Number((0.12 + Math.sin(i * 0.11) * 0.05).toFixed(4)),
    ]),
  });
  const profile = {
    version: 1,
    language: "en",
    muted: true,
    onboardingSeen: true,
    players: [1, 2, 3, 4].map((i) => ({
      id: String(i),
      name: "PRIVATE_NAME_" + i,
      team: i % 2,
    })),
    custom: ["PRIVATE_CUSTOM_WORD"],
    settings: {
      mode: "teams",
      surface: "paper",
      topic: "custom",
      difficulty: "general",
      cardLanguage: "en",
      seconds: 120,
      roundsEach: 1,
    },
  };
  try {
    // Home destinations and predictable quick preset preserve the player's custom setup.
    {
      const c = await browser.newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
        }),
        p = await c.newPage();
      await p.addInitScript((profile) => {
        if (!localStorage.sg_v1_profile)
          localStorage.sg_v1_profile = JSON.stringify(profile);
        localStorage.pp_custom_words = '["OLD_PRIVATE_WORD"]';
      }, profile);
      await p.goto(process.env.TEST_URL);
      for (const [a, label] of [
        ["quick", "Quick Play"],
        ["setup", "Set up game"],
        ["settings", "Settings"],
      ])
        assert.equal(
          await p.locator(`.hero-actions [data-action="${a}"]`).innerText(),
          label,
        );
      await p.locator('[data-action="quick"]').click();
      const state = await p.evaluate(() => ({
        p: JSON.parse(localStorage.sg_v1_profile),
        g: JSON.parse(localStorage.sg_v1_game),
        old: localStorage.pp_custom_words,
      }));
      assert.deepEqual(state.p, profile);
      assert.equal(state.old, '["OLD_PRIVATE_WORD"]');
      assert.equal(state.g.players.length, 4);
      assert.equal(state.g.settings.mode, "individual");
      assert.equal(state.g.settings.surface, "canvas");
      assert.equal(state.g.settings.seconds, 60);
      assert.equal(state.g.schedule.length, 12);
      assert.equal(
        state.g.deck.length,
        bank.collections.starter.wordIds.length,
      );
      assert.equal(state.g.settings.drawPolicy, "unique");
      assert.equal(state.g.settings.topic, "starter");
      assert.ok(
        state.g.deck.every(
          (w) =>
            w.difficulty === "easy" &&
            w.topic !== "custom" &&
            w.review !== "held",
        ),
      );
      await p.locator('[data-action="exit"]').click();
      const saved = await p.evaluate(() => localStorage.sg_v1_game);
      p.once("dialog", (d) => d.dismiss());
      await p.locator('[data-action="quick"]').click();
      assert.equal(await p.evaluate(() => localStorage.sg_v1_game), saved);
      await p.locator('[data-action="setup"]').click();
      assert.equal(await p.locator(".player-row").count(), 4);
      await c.close();
      records.push({
        case: "quick menu / preserved setup / cancelled replacement",
        pass: true,
      });
    }
    for (const ratio of [1, 4 / 3])
      for (const lang of ["en", "zh"]) {
        const c = await browser.newContext({
            viewport: { width: 390, height: 844 },
            serviceWorkers: "block",
            acceptDownloads: true,
          }),
          p = await c.newPage();
        const game = G.newGame(
          profile.players.slice(0, 2),
          {
            ...profile.settings,
            mode: "coop",
            surface: "canvas",
            topic: "mixed",
            difficulty: "easy",
          },
          bank.words.filter(
            (w) => w.review !== "held" && w.difficulty === "easy",
          ),
        );
        game.canvasRatio = ratio;
        G.reveal(game);
        G.start(game);
        game.strokes = structuredClone(strokes);
        G.end(game, "correct", game.players[1].id);
        assert.ok(G.validGame(game));
        assert.ok(
          game.history[0].artwork.at(-1).points.length <
            strokes.at(-1).points.length,
        );
        await p.addInitScript(
          ({ profile, game, lang }) => {
            if (!localStorage.sg_v1_profile) {
              localStorage.sg_v1_profile = JSON.stringify({
                ...profile,
                language: lang,
              });
              localStorage.sg_v1_game = JSON.stringify(game);
              localStorage.pp_game = '{"untouched":true}';
            }
          },
          { profile, game, lang },
        );
        const errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(process.env.TEST_URL);
        await p.locator('[data-action="resume-game"]').click();
        await p.locator('[data-action="open-artwork"]').click();
        // Browser fallback makes a real PNG download with correct ratio and white eraser.
        const download = p.waitForEvent("download");
        await p.locator('[data-action="save-artwork"]').click();
        const d = await download;
        const buffer = fs.readFileSync(await d.path());
        assert.equal(buffer.subarray(1, 4).toString(), "PNG");
        assert.equal(buffer.readUInt32BE(16), 1600);
        assert.equal(buffer.readUInt32BE(20), ratio === 1 ? 2000 : 1600);
        const pixels = await p.evaluate(async (b64) => {
          const im = new Image();
          im.src = "data:image/png;base64," + b64;
          await im.decode();
          const cv = document.createElement("canvas");
          cv.width = im.width;
          cv.height = im.height;
          const cx = cv.getContext("2d");
          cx.drawImage(im, 0, 0);
          return [
            [0.2, 0.4],
            [0.5, 0.4],
            [0.25, 0.7],
            [0.9, 0.9],
          ].map(([x, y]) => [
            ...cx.getImageData(
              Math.round(x * cv.width),
              Math.round(y * (cv.height - 400)),
              1,
              1,
            ).data,
          ]);
        }, buffer.toString("base64"));
        assert.deepEqual(pixels, [
          [233, 100, 85, 255],
          [255, 255, 255, 255],
          [54, 123, 181, 255],
          [255, 255, 255, 255],
        ]);
        await p.evaluate(() => {
          window.nativeCalls = [];
          window.reply = { status: "saved" };
          window.webkit = {
            messageHandlers: {
              partyArtwork: {
                postMessage: async (x) => {
                  window.nativeCalls.push(x);
                  window.dispatchEvent(new Event("native-pause"));
                  window.dispatchEvent(new Event("native-active"));
                  if (window.rejectShare) throw Error("test");
                  return window.reply;
                },
              },
            },
          };
        });
        for (const [action, status] of [
          ["save", "saved"],
          ["share", "shared"],
          ["share", "cancelled"],
          ["save", "denied"],
          ["share", "failed"],
        ]) {
          await p.evaluate((status) => (window.reply = { status }), status);
          await p.locator(`[data-action="${action}-artwork"]`).click();
          assert.ok(
            (await p.locator(".artwork-status").innerText()).length > 0,
          );
          assert.equal(
            await p.locator('[data-action="save-artwork"]').isEnabled(),
            true,
          );
          assert.equal(await p.locator(".privacy-cover").count(), 0);
        }
        await p.evaluate(() => (window.rejectShare = true));
        await p.locator('[data-action="share-artwork"]').click();
        assert.ok(
          (await p.locator(".artwork-status").innerText()).includes(
            lang === "en" ? "Could not" : "未能",
          ),
        );
        const calls = await p.evaluate(() => window.nativeCalls);
        assert.equal(calls.length, 6);
        for (const call of calls) {
          assert.deepEqual(Object.keys(call).sort(), ["action", "png"]);
          assert.ok(call.png.startsWith("data:image/png;base64,"));
        }
        // Sheet remains usable in portrait/landscape and large text.
        for (const [width, height, scale] of [
          [390, 844, 1],
          [844, 390, 1],
          [320, 568, 2],
          [667, 375, 3.12],
        ]) {
          await p.setViewportSize({ width, height });
          await p.evaluate((scale) => {
            document.documentElement.style.setProperty(
              "--text-scale",
              String(scale),
            );
            document.documentElement.classList.toggle(
              "large-text",
              scale > 1.35,
            );
          }, scale);
          await p.evaluate(() => document.fonts.ready);
          const size = await p
            .locator("#artwork-dialog")
            .evaluate((e) => ({ w: e.clientWidth, sw: e.scrollWidth }));
          assert.ok(
            size.sw <= size.w + 2,
            JSON.stringify({ lang, width, height, scale, size }),
          );
          for (const a of ["save-artwork", "share-artwork", "close-artwork"]) {
            const r = await p.locator(`[data-action="${a}"]`).boundingBox();
            assert.ok(r.width >= 44 && r.height >= 44);
          }
        }
        await p.locator('[data-action="close-artwork"]').click();
        p.once("dialog", (d) => d.accept());
        await p.locator('[data-action="finish"]').click();
        await p.locator('[data-action="home"]').last().click();
        await p.reload();
        await p.locator('[data-action="last"]').click();
        await p.locator('.replay-actions [data-action="open-artwork"]').click();
        const afterReloadDownload = p.waitForEvent("download");
        await p.locator('[data-action="save-artwork"]').click();
        const later = await afterReloadDownload;
        assert.deepEqual(
          fs.readFileSync(await later.path()),
          buffer,
          "Full-detail PNG survives round end and reload; no sampled-preview substitution",
        );
        assert.ok(
          !(await p.locator("#artwork-dialog").innerText()).includes(
            lang === "en" ? "older drawing" : "較早",
          ),
        );
        assert.deepEqual(
          await p.locator(".share-card-preview").evaluate(image => [image.naturalWidth, image.naturalHeight]),
          [1600, ratio === 1 ? 2000 : 1600],
        );
        assert.equal(
          await p.evaluate(() => localStorage.pp_game),
          ' {"untouched":true}'.trim(),
        );
        assert.deepEqual(errors, []);
        records.push({
          ratio,
          lang,
          png: [1600, ratio === 1 ? 2000 : 1600],
          pixels: "pass",
          nativeContract: "pass",
          historyReload: "pass",
        });
        await c.close();
      }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/player-flow-artwork.json",
    JSON.stringify(
      { engine: safari ? "webkit" : "chromium", records },
      null,
      2,
    ),
  );
  console.log({
    engine: safari ? "webkit" : "chromium",
    passed: records.length,
  });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
