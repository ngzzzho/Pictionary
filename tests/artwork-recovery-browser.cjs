const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const safari = process.env.TEST_ENGINE === "webkit",
    b = await (safari ? webkit : chromium).launch({
      headless: true,
      ...(!safari && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
  const G = await import("../js/core.mjs"),
    bank = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../js/content.json")),
    ),
    records = [];
  const profile = {
    version: 1,
    language: "en",
    muted: true,
    onboardingSeen: true,
    players: [1, 2].map((i) => ({
      id: String(i),
      name: "Player " + i,
      team: i % 2,
    })),
    custom: ["PRIVATE_CUSTOM"],
    settings: {
      mode: "coop",
      surface: "canvas",
      topic: "mixed",
      difficulty: "easy",
      cardLanguage: "en",
      seconds: 60,
      roundsEach: 1,
    },
  };
  const seedGame = () => {
    const g = G.newGame(
      profile.players,
      profile.settings,
      bank.words.filter((w) => w.review !== "held"),
    );
    G.reveal(g);
    G.start(g);
    g.strokes = [
      {
        color: "#243450",
        width: 7,
        points: [
          [0.1, 0.1],
          [0.6, 0.6],
        ],
      },
    ];
    G.end(g, "correct", G.eligible(g)[0].id);
    return g;
  };
  try {
    for (const unavailable of [false, true]) {
      const c = await b.newContext({
          serviceWorkers: "block",
          acceptDownloads: true,
        }),
        p = await c.newPage(),
        game = seedGame();
      if (!unavailable) G.finish(game);
      await p.addInitScript(
        ({ profile, game, unavailable }) => {
          localStorage.sg_v1_profile = JSON.stringify(profile);
          localStorage[unavailable ? "sg_v1_game" : "sg_v1_last"] =
            JSON.stringify(game);
          localStorage.pp_custom_words = '["KEEP"]';
          if (unavailable)
            Object.defineProperty(window, "indexedDB", { value: undefined });
        },
        { profile, game, unavailable },
      );
      await p.goto(process.env.TEST_URL);
      await p
        .locator(`[data-action="${unavailable ? "resume-game" : "last"}"]`)
        .click();
      await p.locator('[data-action="open-artwork"]').click();
      if (unavailable) {
        await p.waitForFunction(() =>
          document
            .querySelector("#notices")
            .textContent.includes("full drawing"),
        );
      } else
        assert.ok(
          (await p.locator("#artwork-dialog").innerText()).includes(
            "older drawing",
          ),
        );
      const download = p.waitForEvent("download");
      await p.locator('[data-action="save-artwork"]').click();
      const file = await download;
      assert.ok(fs.statSync(await file.path()).size > 100);
      await p.locator('[data-action="close-artwork"]').click();
      await p
        .locator(`[data-action="${unavailable ? "exit" : "home"}"]`)
        .last()
        .click();
      await p.locator('[data-action="settings"]').first().click();
      await p.locator('[data-action="backup"]').click();
      await p.locator('[data-action="backup-create"]').click();
      await p.locator('[data-action="backup-save"]').first().waitFor();
      const backup = p.waitForEvent("download");
      await p.locator('[data-action="backup-save"]').first().click();
      const bd = await backup,
        part = JSON.parse(fs.readFileSync(await bd.path())),
        data = JSON.parse(Buffer.from(part.data, "base64").toString("utf8"));
      assert.equal(data.artworkArchiveUnavailable, unavailable);
      assert.equal(data.raw.pp_custom_words, '["KEEP"]');
      assert.ok(Array.isArray(data.artworkArchive));
      assert.equal(
        await p.evaluate(() => localStorage.pp_custom_words),
        '["KEEP"]',
      );
      records.push({
        case: unavailable
          ? "archive unavailable: visible warning, image still exportable, labelled partial backup"
          : "old preview remains exportable without archive",
        pass: true,
      });
      await c.close();
    }
    // Exercise two current subjects through the built-in topic selector.
    for (const topic of ["transport", "occupations"]) {
      const count = bank.words.filter(
        (w) =>
          w.review !== "held" && w.topic === topic && w.difficulty === "easy",
      ).length;
      assert.ok(count >= 5, `${topic} must meet the current five-card minimum`);
      const c = await b.newContext({ serviceWorkers: "block" }),
        p = await c.newPage();
      await p.addInitScript(
        (profile) => (localStorage.sg_v1_profile = JSON.stringify(profile)),
        profile,
      );
      await p.goto(process.env.TEST_URL);
      await p.locator('[data-action="setup"]').click();
      await p.locator('[data-action="step"][data-step="2"]').click();
      await p.locator('details[data-disclosure="subjects"] > summary').click();
      assert.equal(
        await p.locator('[data-key="topic"][data-value="science"]').count(),
        0,
      );
      assert.equal(
        await p
          .locator(`[data-key="topic"][data-value="${topic}"]`)
          .isEnabled(),
        true,
      );
      await p.locator(`[data-key="topic"][data-value="${topic}"]`).click();
      await p.locator('[data-action="next-step"]').click();
      await p.locator('[data-action="start-game"]').click();
      const g = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
      assert.equal(g.deck.length, count);
      assert.ok(
        g.deck.every((w) => w.topic === topic && w.difficulty === "easy"),
      );
      records.push({ topic, easy: count, pass: true });
      await c.close();
    }
  } finally {
    await b.close();
  }
  console.log({ engine: safari ? "webkit" : "chromium", records });
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/player-flow-recovery.json",
    JSON.stringify(records, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
