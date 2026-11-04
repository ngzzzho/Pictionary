// Synthetic isolated stores; DOM-only. No screenshots or user contexts.
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
      [
        "index.html",
        "js/app.js",
        "js/content.json",
        "js/native-locales.json",
        "css/compact-ui.css",
      ].map(async (n) => {
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
    P = await import("../js/profile.mjs"),
    G = await import("../js/core.mjs");
  const bank = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../js/content.json")),
    ),
    prior = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../scripts/content-depth-baseline.json"),
      ),
    );
  const locales = "en zh zh-Hans ja ko de fr es pt it ar".split(" "),
    players = Array.from({ length: 4 }, (_, i) => ({
      id: `depth-synthetic-${i}`,
      name: `Player ${i + 1}`,
      team: i % 2,
    }));
  const profile = (language = "en", topic = "mixed") => ({
    version: 1,
    language,
    muted: true,
    onboardingSeen: true,
    players,
    custom: ["Own synthetic custom word"],
    settings: {
      ...P.defaults,
      topic,
      difficulty: "general",
      cardLanguage: language,
    },
  });
  const ids = (x) => x.map((w) => w.id).sort();
  const expected = (topics) =>
    ids(
      bank.words.filter((w) => w.review !== "held" && topics.includes(w.topic)),
    );
  assert.equal(expected(["home", "equipment"]).length, 191);
  const labels = Object.fromEntries(
    locales.map((x) => [
      x,
      JSON.parse(
        fs.readFileSync(path.join(__dirname, `../js/locales/${x}.json`)),
      ).topics,
    ]),
  );
  for (const engine of ["chromium", "webkit"]) {
    const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    let context;
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
      } finally {
        if (context) {
          await context.close();
          context = null;
        }
      }
    }
    async function pageFor(pr, w = 393, h = 852, old = null) {
      assert.ok(P.validProfile(pr));
      context = await browser.newContext({
        viewport: { width: w, height: h },
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      const p = await context.newPage();
      await p.addInitScript(
        ({ pr, old }) => {
          if (!sessionStorage.depthSeeded) {
            localStorage.sg_v1_profile = JSON.stringify(pr);
            if (old) localStorage.sg_v1_game = old;
            sessionStorage.depthSeeded = "1";
          }
        },
        { pr, old },
      );
      await p.goto(base);
      return p;
    }
    async function setup(p) {
      await p.locator('[data-action="setup"]').first().click();
      await p.locator('[data-step="2"]').click();
    }
    const chooser = (p) => p.locator('details[data-disclosure="subjects"]');
    async function open(p) {
      if (!(await chooser(p).evaluate((x) => x.open)))
        await chooser(p).locator("summary").click();
    }
    const pick = (p, key) =>
      p.locator(`[data-value="${key}"][data-key="topic"]`).click();
    const count = async (p) =>
      Number(await p.locator(".subject-count").textContent());
    async function selected(p) {
      return p
        .locator('[data-action="topic-toggle"][aria-pressed="true"]')
        .evaluateAll((xs) => xs.map((x) => x.dataset.value).sort());
    }
    async function done(p) {
      await p.locator('[data-action="topics-done"]').click();
      assert.equal(await chooser(p).evaluate((x) => x.open), false);
    }
    async function start(p, topics) {
      await p.locator('[data-step="3"]').click();
      await p.locator('[data-action="start-game"]').click();
      const g = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
      assert.deepEqual(ids(g.deck), expected(topics));
      assert.ok(g.deck.every((w) => !w.id.startsWith("custom:")));
      return g;
    }
    try {
      for (const locale of locales)
        for (const [w, h] of [
          [393, 852],
          [844, 390],
        ])
          await run(
            `${locale}/${w}x${h}/new-topic-labels-icons-geometry`,
            async () => {
              const p = await pageFor(profile(locale), w, h);
              await setup(p);
              await open(p);
              await p.evaluate(() => document.fonts.ready);
              const tiles = [];
              for (const key of ["home", "equipment"]) {
                const t = p.locator(
                  `[data-action="topic-toggle"][data-value="${key}"]`,
                );
                await t.scrollIntoViewIfNeeded();
                assert.equal(
                  await t.locator("strong").textContent(),
                  labels[locale][key],
                );
                const r = await t.evaluate((x) => {
                  const b = x.getBoundingClientRect(),
                    i = x.querySelector(".pack-icon"),
                    im = i?.querySelector("img");
                  return {
                    width: b.width,
                    height: b.height,
                    asset: i?.dataset.asset,
                    loaded: !!(im?.complete && im.naturalWidth),
                    mask: i
                      ? getComputedStyle(i).getPropertyValue("--picto")
                      : null,
                  };
                });
                assert.ok(r.width >= 44 && r.height >= 44, JSON.stringify(r));
                assert.ok(
                  r.asset?.startsWith("assets/layerlab/") &&
                    r.loaded &&
                    r.mask.includes(r.asset),
                  JSON.stringify(r),
                );
                tiles.push({ key, ...r });
              }
              const overflow = await p.evaluate(() => ({
                document: document.documentElement.scrollWidth - innerWidth,
                panel:
                  document.querySelector(".setup-panel").scrollWidth -
                  document.querySelector(".setup-panel").clientWidth,
              }));
              assert.ok(
                overflow.document <= 2 && overflow.panel <= 2,
                JSON.stringify(overflow),
              );
              assert.equal(
                await p
                  .locator('[data-value="things"][data-key="topic"]')
                  .count(),
                0,
              );
              return { locale, viewport: [w, h], tiles, overflow };
            },
          );
      for (const oldTopic of ["things", "food+things"])
        await run(
          `legacy-${oldTopic}/expansion-no-widening-start`,
          async () => {
            const pr = profile("en", oldTopic),
              p = await pageFor(pr);
            const initial = await p.evaluate(() =>
              JSON.parse(localStorage.sg_v1_profile),
            );
            assert.ok(P.validProfile(initial));
            assert.equal(initial.settings.topic, oldTopic);
            await setup(p);
            await open(p);
            const keys =
              oldTopic === "things"
                ? ["equipment", "home"]
                : ["equipment", "food", "home"];
            assert.deepEqual(await selected(p), keys);
            assert.equal(await count(p), expected(keys).length);
            await done(p);
            const g = await start(p, keys);
            return {
              legacyProfileValidBeforeEdit: true,
              selected: keys,
              deckSize: g.deck.length,
              noCustomOrMixedWidening: true,
            };
          },
        );
      await run("actual-new-toggle-done-start-persistence", async () => {
        const p = await pageFor(profile());
        await setup(p);
        await open(p);
        await pick(p, "home");
        await pick(p, "equipment");
        assert.deepEqual(await selected(p), ["equipment", "home"]);
        assert.equal(await count(p), 191);
        await done(p);
        let stored = await p.evaluate(() =>
          JSON.parse(localStorage.sg_v1_profile),
        );
        assert.deepEqual(stored.settings.topic.split("+").sort(), [
          "equipment",
          "home",
        ]);
        await p.reload();
        await setup(p);
        await open(p);
        assert.deepEqual(await selected(p), ["equipment", "home"]);
        await done(p);
        const g = await start(p, ["home", "equipment"]);
        const raw = await p.evaluate(() => localStorage.sg_v1_game);
        await p.reload();
        assert.equal(await p.evaluate(() => localStorage.sg_v1_game), raw);
        return {
          deckSize: g.deck.length,
          newKeysPersist: true,
          gameExactAfterReload: true,
        };
      });
      await run(
        "legacy-active-game-byte-exact-after-new-topic-edit",
        async () => {
          const pr = profile("en", "food+things");
          const old = G.newGame(
            players,
            { ...pr.settings, drawPolicy: "unique" },
            prior.words.filter(
              (w) =>
                w.review !== "held" && ["food", "things"].includes(w.topic),
            ),
            1000,
          );
          G.reveal(old);
          const raw = JSON.stringify(G.snapshot(old, 1100));
          assert.ok(G.validGame(JSON.parse(raw)));
          const p = await pageFor(pr, 393, 852, raw);
          await setup(p);
          await open(p);
          await pick(p, "food");
          assert.deepEqual(await selected(p), ["equipment", "home"]);
          await done(p);
          assert.equal(await p.evaluate(() => localStorage.sg_v1_game), raw);
          await p.reload();
          assert.equal(await p.evaluate(() => localStorage.sg_v1_game), raw);
          return {
            oldTopic: old.settings.topic,
            oldDeckSize: old.deck.length,
            storedActiveGameByteExact: true,
          };
        },
      );
    } finally {
      await browser.close();
    }
  }
  const after = await hashes();
  if (JSON.stringify(before) !== JSON.stringify(after))
    failures.push({
      name: "stable-served-build",
      error: "Served assets changed",
    });
  else results.push({ name: "stable-served-build" });
  const output = {
    base,
    caseCount: results.length + failures.length,
    passed: results.length,
    failures,
    results,
    buildBefore: before,
    buildAfter: after,
  };
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
