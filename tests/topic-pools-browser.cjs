// Isolated synthetic player stores, DOM and storage outcomes only; no screenshots.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { createHash } = require("node:crypto");
const base = process.env.TEST_URL || "http://127.0.0.1:8766/",
  results = [],
  failures = [];
async function hashes() {
  return Object.fromEntries(
    await Promise.all(
      ["js/app.js", "js/content.json", "css/compact-ui.css"].map(async (n) => {
        const r = await fetch(new URL(n, base));
        assert.equal(r.status, 200);
        return [
          n,
          createHash("sha256")
            .update(Buffer.from(await r.arrayBuffer()))
            .digest("hex"),
        ];
      }),
    ),
  );
}
(async () => {
  const before = await hashes(),
    { defaults } = await import("../js/profile.mjs"),
    G = await import("../js/core.mjs");
  const bank = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../js/content.json")),
    ),
    baseline = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../scripts/content-topic-baseline.json"),
      ),
    );
  const locales = "en,zh,zh-Hans,ja,ko,de,fr,es,pt,it,ar".split(",");
  const players = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `synthetic-${i}`,
      name: `Player ${i + 1}`,
      team: i % 2,
    }));
  const profile = (language = "en", n = 4) => ({
    version: 1,
    language,
    muted: true,
    onboardingSeen: true,
    players: players(n),
    custom: Array.from({ length: 10 }, (_, i) => `Own word ${i}`),
    settings: {
      ...defaults,
      topic: "mixed",
      difficulty: "general",
      cardLanguage: language,
    },
  });
  const expected = (level) =>
    bank.words
      .filter(
        (w) =>
          w.review !== "held" &&
          ["food", "occupations"].includes(w.topic) &&
          (level === "general" || w.difficulty === level),
      )
      .map((w) => w.id)
      .sort();
  const jobsEasy = bank.words.filter(
    (w) =>
      w.review !== "held" &&
      w.topic === "occupations" &&
      w.difficulty === "easy",
  ).length;
  const receipt = () => ({
    base,
    caseCount: results.length + failures.length,
    passed: results.length,
    failures,
    results,
    buildBefore: before,
  });
  for (const engine of ["chromium", "webkit"]) {
    const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    const contexts = [];
    async function pageFor(p, width = 393, height = 852, old = null) {
      const c = await browser.newContext({
        viewport: { width, height },
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      contexts.push(c);
      const page = await c.newPage();
      await page.addInitScript(
        ({ profile, old }) => {
          if (!sessionStorage.topicPoolSeeded) {
            localStorage.sg_v1_profile = JSON.stringify(profile);
            if (old) localStorage.sg_v1_game = old;
            sessionStorage.topicPoolSeeded = "1";
          }
        },
        { profile: p, old },
      );
      await page.goto(base);
      await page.locator('[data-action="setup"]').first().click();
      await page.locator('[data-step="2"]').click();
      return page;
    }
    async function run(name, fn) {
      try {
        const detail = await fn();
        results.push({ name: `${engine}/${name}`, ...detail });
      } catch (e) {
        failures.push({
          name: `${engine}/${name}`,
          error: e.stack || String(e),
        });
        console.error(name, e.message);
      }
    }
    const chooser = (p) => p.locator('details[data-disclosure="subjects"]');
    const open = async (p) => {
      if (!(await chooser(p).evaluate((x) => x.open)))
        await chooser(p).locator("summary").click();
    };
    const pick = async (p, key) =>
      p.locator(`[data-value="${key}"][data-key="topic"]`).click();
    const count = async (p) =>
      Number(await p.locator(".subject-count").textContent());
    async function union(p) {
      await open(p);
      await pick(p, "food");
      assert.equal(await chooser(p).evaluate((x) => x.open), true);
      await pick(p, "occupations");
      assert.equal(await chooser(p).evaluate((x) => x.open), true);
      for (const k of ["food", "occupations"])
        assert.equal(
          await p
            .locator(`[data-value="${k}"][data-key="topic"]`)
            .getAttribute("aria-pressed"),
          "true",
        );
      assert.equal(await count(p), expected("general").length);
    }
    async function geometry(p) {
      await p.evaluate(() => document.fonts.ready);
      const r = await p.evaluate(() => {
        const panel = document.querySelector(".setup-panel"),
          a = panel.getBoundingClientRect(),
          f = document.querySelector(".bottom-actions").getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          panelBottom: a.bottom,
          footerTop: f.top,
          footerBottom: f.bottom,
          height: innerHeight,
        };
      });
      assert.ok(r.overflow <= 2 && r.panelOverflow <= 2, JSON.stringify(r));
      assert.ok(
        r.panelBottom <= r.footerTop + 2 && r.footerBottom <= r.height + 2,
        JSON.stringify(r),
      );
      return r;
    }
    try {
      for (const locale of locales)
        for (const [w, h] of [
          [393, 852],
          [844, 390],
        ])
          await run(`${locale}/${w}x${h}/union-geometry`, async () => {
            const p = await pageFor(profile(locale), w, h);
            await union(p);
            return geometry(p);
          });
      for (const locale of ["en", "zh", "ar"])
        await run(`${locale}/union-start-reload`, async () => {
          const p = await pageFor(profile(locale));
          await union(p);
          const names = await p
            .locator(
              '[data-key="topic"][data-value="food"] strong,[data-key="topic"][data-value="occupations"] strong',
            )
            .allTextContents();
          for (const [level, n] of [
            ["easy", expected("easy").length],
            ["medium", expected("medium").length],
            ["general", expected("general").length],
          ]) {
            await p
              .locator(`[data-key="difficulty"][data-value="${level}"]`)
              .click();
            assert.equal(await count(p), n);
            assert.ok(await chooser(p).evaluate((x) => x.open));
          }
          await p.locator('[data-action="topics-done"]').click();
          assert.equal(await chooser(p).evaluate((x) => x.open), false);
          await p.waitForFunction(
            () =>
              document.querySelector(
                '[data-disclosure="subjects"] > summary',
              ) === document.activeElement,
            null,
            { timeout: 2000 },
          );
          await p.locator('[data-step="3"]').click();
          const text = await p.locator(".summary-grid").textContent();
          for (const name of names) assert.ok(text.includes(name), text);
          await p.locator('[data-action="start-game"]').click();
          const game = await p.evaluate(() =>
            JSON.parse(localStorage.sg_v1_game),
          );
          assert.deepEqual(
            game.deck.map((w) => w.id).sort(),
            expected("general"),
          );
          assert.ok(game.deck.every((w) => !w.id.startsWith("custom:")));
          const snapshot = JSON.stringify(game);
          await p.reload();
          assert.equal(
            await p.evaluate(() => localStorage.sg_v1_game),
            snapshot,
          );
          const stored = await p.evaluate(() =>
            JSON.parse(localStorage.sg_v1_profile),
          );
          assert.deepEqual(stored.settings.topic.split("+").sort(), [
            "food",
            "occupations",
          ]);
          return {
            counts: ["easy", "medium", "general"].map(
              (level) => expected(level).length,
            ),
            deckSize: game.deck.length,
            snapshotExactAfterReload: true,
          };
        });
      await run("undersized-job-pool-recovery", async () => {
        const pr = profile("en", 12);
        pr.settings.roundsEach = 3;
        pr.settings.difficulty = "easy";
        const p = await pageFor(pr);
        await open(p);
        const jobs = p.locator('[data-key="topic"][data-value="occupations"]');
        assert.equal(await jobs.isDisabled(), false);
        await jobs.click();
        assert.ok(
          jobsEasy < 36,
          "Jobs Easy must remain undersized for this 36-turn recovery scenario",
        );
        assert.equal(await count(p), jobsEasy);
        await p.locator('[data-action="topics-done"]').click();
        await p.locator('[data-step="3"]').click();
        assert.equal(await p.locator('[data-action="start-game"]').count(), 0);
        if (await p.locator('[data-action="fix-setup"]').count())
          await p.locator('[data-action="fix-setup"]').click();
        assert.ok(await p.locator(".setup-step-2").count());
        assert.ok(await p.locator(".pool-recovery").count());
        await p.locator('[data-action="add-topics"]').click();
        assert.ok(await chooser(p).evaluate((x) => x.open));
        await pick(p, "food");
        assert.ok(
          expected("easy").length >= 36,
          "Adding Food must satisfy 36 scheduled turns",
        );
        assert.equal(await count(p), expected("easy").length);
        await p.locator('[data-action="topics-done"]').click();
        await p.locator('[data-step="3"]').click();
        await p.locator('[data-action="start-game"]').click();
        const game = await p.evaluate(() =>
          JSON.parse(localStorage.sg_v1_game),
        );
        assert.equal(game.schedule.length, 36);
        assert.deepEqual(game.deck.map((w) => w.id).sort(), expected("easy"));
        return { jobsEasy, combinedEasy: expected("easy").length, turns: 36 };
      });
      await run("exclusive-presets-and-final-topic-protection", async () => {
        const p = await pageFor(profile());
        await open(p);
        await pick(p, "food");
        await pick(p, "food");
        assert.equal(
          await p
            .locator('[data-key="topic"][data-value="food"]')
            .getAttribute("aria-pressed"),
          "true",
        );
        await pick(p, "mixed");
        let value = await p.evaluate(
          () => JSON.parse(localStorage.sg_v1_profile).settings.topic,
        );
        assert.equal(value, "mixed");
        assert.equal(
          await p
            .locator('[data-action="topic-toggle"][aria-pressed="true"]')
            .count(),
          0,
        );
        await p.locator('[data-disclosure="subjects"] summary').click();
        await p
          .locator('[data-action="playlist"][data-value="starter"]')
          .click();
        value = await p.evaluate(
          () => JSON.parse(localStorage.sg_v1_profile).settings.topic,
        );
        assert.equal(value, "starter");
        await open(p);
        await pick(p, "custom");
        assert.equal(
          await p.evaluate(
            () => JSON.parse(localStorage.sg_v1_profile).settings.topic,
          ),
          "custom",
        );
        await open(p);
        await pick(p, "food");
        await pick(p, "occupations");
        await p
          .locator('[data-key="difficulty"][data-value="general"]')
          .click();
        assert.equal(await count(p), expected("general").length);
        return {
          lastTopicProtected: true,
          mixedStarterCustomExclusive: true,
          customAbsentFromUnion: true,
        };
      });
      await run("historic-active-game-byte-preservation", async () => {
        const historic = G.newGame(
          players(4),
          {
            ...defaults,
            topic: "fantasy",
            difficulty: "general",
            drawPolicy: "unique",
          },
          baseline.words.filter(
            (w) => w.review !== "held" && w.topic === "fantasy",
          ),
          1000,
        );
        const raw = JSON.stringify(historic);
        const p = await pageFor(profile(), 393, 852, raw);
        await union(p);
        assert.equal(await p.evaluate(() => localStorage.sg_v1_game), raw);
        await p.reload();
        assert.equal(await p.evaluate(() => localStorage.sg_v1_game), raw);
        return { oldDeck: historic.deck.length, storedGameByteExact: true };
      });
    } finally {
      for (const c of contexts) await c.close();
      await browser.close();
    }
  }
  const after = await hashes();
  if (JSON.stringify(before) !== JSON.stringify(after))
    failures.push({
      name: "stable-served-build",
      error: "Served assets changed during test",
    });
  else results.push({ name: "stable-served-build" });
  const output = { ...receipt(), buildAfter: after };
  if (process.env.RECEIPT) {
    fs.mkdirSync(path.dirname(process.env.RECEIPT), { recursive: true });
    fs.writeFileSync(process.env.RECEIPT, JSON.stringify(output, null, 2));
  }
  console.log(JSON.stringify(output, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
