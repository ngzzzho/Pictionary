// Synthetic data; DOM/geometry checks only. No licensed pixel capture.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const { selectableLocales: locales, localeInfo } = await import(
    "../js/languages.mjs"
  );
  const { catalogs } = await import("../js/localization.mjs");
  const { defaults } = await import("../js/profile.mjs");
  const records = [],
    failures = [];
  const engine = process.env.TEST_ENGINE || "chromium";
  const b = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    for (const { code, tag, dir } of locales.filter(
      (l) =>
        !process.env.TEST_CODES ||
        process.env.TEST_CODES.split(",").includes(l.code),
    ))
      for (const [width, height, scale] of process.env.TEST_QUICK
        ? [[390, 844, 1]]
        : [
            [390, 844, 1],
            [844, 390, 1],
            [320, 568, 1],
            [390, 844, 2],
          ]) {
        const c = await b.newContext({
            viewport: { width, height },
            serviceWorkers: "block",
            reducedMotion: "reduce",
          }),
          p = await c.newPage(),
          errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        const pair =
          code === "ar"
            ? "ar+ja"
            : code === "ja"
              ? "ja+ar"
              : code === "en"
                ? "en+zh"
                : `${code}+en`;
        const profile = {
          version: 1,
          language: code,
          muted: true,
          onboardingSeen: true,
          players: [
            { id: "a", name: "Painter", team: 0 },
            { id: "b", name: "Friend", team: 1 },
          ],
          custom: ["KEEP 原文"],
          settings: {
            ...defaults,
            mode: "coop",
            cardLanguage: pair,
            seconds: 120,
            roundsEach: 1,
          },
        };
        await p.addInitScript((profile) => {
          localStorage.sg_v1_profile = JSON.stringify(profile);
          localStorage.pp_custom_words = '["PRESERVE OLD WORD"]';
        }, profile);
        await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        await p.locator('[data-action="quick"]').waitFor();
        await p.evaluate((scale) => {
          document.documentElement.style.setProperty(
            "--text-scale",
            String(scale),
          );
          document.documentElement.classList.toggle("large-text", scale > 1.35);
        }, scale);
        const click = async (a) => {
          await p.locator(`[data-action="${a}"]`).first().click();
        };
        const check = async (screen) => {
          await p.evaluate(() => document.fonts.ready);
          await p.evaluate(() => scrollTo(0, 0));
          const r = await p.evaluate(() => {
            const shown = (e) =>
              e.getClientRects().length && !e.closest("[inert]");
            const controls = [
              ...document.querySelectorAll("button,input,select"),
            ].filter(shown);
            const small = controls
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width < 43.5 || r.height < 43.5;
              })
              .map((e) => e.dataset.action || e.id);
            const clipped = controls
              .filter(
                (e) =>
                  e.tagName !== "INPUT" &&
                  e.tagName !== "SELECT" &&
                  (e.scrollWidth > e.clientWidth + 3 ||
                    e.scrollHeight > e.clientHeight + 3),
              )
              .map((e) => ({
                a: e.dataset.action || e.id,
                w: e.clientWidth,
                sw: e.scrollWidth,
                h: e.clientHeight,
                sh: e.scrollHeight,
                text: e.textContent.slice(0, 40),
              }));
            const outside = [
              ...document.querySelectorAll(
                "h1,h2,.word-card,.card-line,.header-title",
              ),
            ]
              .filter(shown)
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.left < -1 || r.right > innerWidth + 1;
              })
              .map((e) => e.className || e.tagName);
            const wordSizes = [
              ...document.querySelectorAll(".word-card .card-line bdi"),
            ].map((e) => parseFloat(getComputedStyle(e).fontSize));
            return {
              lang: document.documentElement.lang,
              dir: document.documentElement.dir,
              overflow: document.documentElement.scrollWidth > innerWidth + 2,
              small,
              clipped,
              outside,
              wordSizes,
            };
          });
          const row = { code, width, height, scale, screen, ...r };
          records.push(row);
          if (
            r.lang !== tag ||
            r.dir !== dir ||
            r.overflow ||
            r.small.length ||
            r.clipped.length ||
            r.outside.length ||
            r.wordSizes.some((n) => n < 22)
          )
            failures.push(row);
        };
        await check("home");
        await click("language-menu");
        await check("language-menu");
        assert.equal(
          await p.locator('[data-action="language"]').count(),
          locales.length,
        );
        await click("language-back");
        await click("settings");
        await check("settings");
        await p.selectOption("#card-primary", "ja");
        await p.selectOption("#card-secondary", "ar");
        await p
          .locator('details[data-disclosure="card-preview"] > summary')
          .click();
        assert.equal(
          await p.locator('.card-language-preview [lang="ja"]').count(),
          1,
        );
        assert.equal(
          await p.locator('.card-language-preview [dir="rtl"]').count(),
          1,
        );
        const selected = await p.evaluate(
          () => JSON.parse(localStorage.sg_v1_profile).settings.cardLanguage,
        );
        assert.equal(selected, "ja+ar");
        await click("home");
        await click("setup");
        await check("setup-players");
        await click("next-step");
        await check("setup-rules");
        await click("next-step");
        await check("setup-deck");
        await click("next-step");
        await check("setup-ready");
        await click("start-game");
        await check("handoff");
        await click("reveal");
        await check("reveal");
        let saved = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
        const word = saved.word;
        assert.deepEqual(
          await p.locator(".word-card .card-line bdi").allTextContents(),
          [catalogs.ja.words[word.id], catalogs.ar.words[word.id]],
        );
        assert.equal(
          await p.locator('.word-card [lang="ja"]').getAttribute("dir"),
          "ltr",
        );
        assert.equal(
          await p.locator('.word-card [lang="ar"]').getAttribute("dir"),
          "rtl",
        );
        await click("draw");
        await check("drawing");
        const box = await p.locator("#drawing-canvas").boundingBox();
        await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
        await p.mouse.down();
        await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
          steps: 4,
        });
        await p.mouse.up();
        assert.equal(
          await p
            .locator("#drawing-canvas")
            .evaluate((e) => getComputedStyle(e).direction),
          "ltr",
        );
        await p.locator("#peek").dispatchEvent("pointerdown", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
        });
        assert.deepEqual(
          await p.locator("#peek .card-line bdi").allTextContents(),
          [catalogs.ja.words[word.id], catalogs.ar.words[word.id]],
        );
        await p
          .locator("#peek")
          .dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch" });
        assert.equal(await p.locator("#peek .card-line").count(), 0);
        await click("judge");
        await check("judge");
        await click("correct");
        await check("result");
        await click("exit");
        await click("settings");
        await p.selectOption("#card-primary", "fr");
        await p.selectOption("#card-secondary", "");
        await p
          .locator('details[data-disclosure="card-preview"] > summary')
          .click();
        await check("single-card-preview");
        assert.equal(
          await p.evaluate(
            () => JSON.parse(localStorage.sg_v1_game).settings.cardLanguage,
          ),
          "ja+ar",
        );
        await click("backup");
        await check("backup");
        await click("settings");
        await click("home");
        await click("gallery");
        await check("gallery");
        await click("gallery-back");
        await click("tv");
        await check("tv");
        assert.equal(
          await p.evaluate(() => localStorage.pp_custom_words),
          '["PRESERVE OLD WORD"]',
        );
        assert.deepEqual(errors, []);
        await c.close();
      }
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.RECEIPT || "../v1-checks/localization/browser.json",
      JSON.stringify({ engine, records, failures }, null, 2) + "\n",
    );
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 8)));
  console.log(
    JSON.stringify({
      engine,
      checks: records.length,
      failures: failures.length,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
