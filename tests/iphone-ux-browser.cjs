// DOM/geometry/interaction audit only. Never captures or decodes licensed pixels.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const results = [],
  failures = [];
const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
const viewports = [
  [320, 568, { top: 20, bottom: 0, left: 0, right: 0 }],
  [390, 844, { top: 47, bottom: 34, left: 0, right: 0 }],
  [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }],
  [667, 375, { top: 0, bottom: 0, left: 0, right: 0 }],
];
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  try {
    for (const lang of ["en", "zh"])
      for (const scale of (process.env.TEST_SCALES || "1,2")
        .split(",")
        .map(Number))
        for (const [width, height, insets] of viewports) {
          const context = await browser.newContext({
            viewport: { width, height },
            serviceWorkers: "block",
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
          await page.addInitScript((lang) => {
            localStorage.pp_custom_words = '["LEGACY PRESERVE"]';
            localStorage.sg_v1_profile = JSON.stringify({
              version: 1,
              language: lang,
              muted: true,
              onboardingSeen: false,
              players: [1, 2, 3, 4].map((i) => ({
                id: String(i),
                name: "Player " + i,
                team: i % 2,
              })),
              custom: [],
              settings: {
                mode: "individual",
                surface: "canvas",
                topic: "mixed",
                difficulty: "easy",
                cardLanguage: "both",
                seconds: 120,
                roundsEach: 1,
              },
            });
          }, lang);
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          await page.locator('[data-action="quick"]').waitFor();
          await page.evaluate((scale) => {
            document.documentElement.style.setProperty(
              "--text-scale",
              String(scale),
            );
            document.documentElement.classList.toggle(
              "large-text",
              scale > 1.35,
            );
          }, scale);
          const click = (a) =>
            page.locator(`[data-action="${a}"]`).first().click();
          const check = async (screen, critical = []) => {
            await page.evaluate(() => scrollTo(0, 0));
            await page.waitForTimeout(35);
            const measurement = await page.evaluate(
              ({ critical, insets, scale }) => {
                const rect = (e) => {
                  const r = e.getBoundingClientRect();
                  return {
                    x: r.x,
                    y: r.y,
                    w: r.width,
                    h: r.height,
                    bottom: r.bottom,
                    right: r.right,
                  };
                };
                const shown = (e) =>
                  e.getClientRects().length && !e.closest("[inert]");
                const interactive = [
                  ...document.querySelectorAll("button,input,summary"),
                ].filter(shown);
                const tooSmall = interactive
                  .filter((e) => {
                    const r = rect(e);
                    return r.w < 43.5 || r.h < 43.5;
                  })
                  .map((e) => ({
                    action: e.dataset.action || e.tagName,
                    text: e.textContent.slice(0, 35),
                    ...rect(e),
                  }));
                const clippedText = interactive
                  .filter(
                    (e) =>
                      e.tagName !== "INPUT" &&
                      e.scrollWidth > e.clientWidth + 2,
                  )
                  .map((e) => ({
                    action: e.dataset.action,
                    text: e.textContent.slice(0, 35),
                    scroll: e.scrollWidth,
                    client: e.clientWidth,
                  }));
                const hiddenActions =
                  scale === 1
                    ? critical.flatMap((s) => {
                        const e = document.querySelector(s);
                        if (!e) return [{ selector: s, missing: true }];
                        const r = rect(e);
                        return r.y < insets.top - 1 ||
                          r.bottom > innerHeight - insets.bottom + 1 ||
                          r.x < insets.left - 1 ||
                          r.right > innerWidth - insets.right + 1
                          ? [{ selector: s, ...r }]
                          : [];
                      })
                    : [];
                const dialog = document.querySelector("dialog[open]");
                return {
                  overflow:
                    document.documentElement.scrollWidth > innerWidth + 1,
                  tooSmall,
                  clippedText,
                  hiddenActions,
                  dialogOverflow: dialog
                    ? dialog.scrollWidth > dialog.clientWidth + 1
                    : false,
                  canvas: document.querySelector("canvas")
                    ? rect(document.querySelector("canvas"))
                    : null,
                };
              },
              { critical, insets, scale },
            );
            results.push({
              lang,
              scale,
              width,
              height,
              screen,
              ...measurement,
            });
            if (
              measurement.overflow ||
              measurement.tooSmall.length ||
              measurement.clippedText.length ||
              measurement.hiddenActions.length ||
              measurement.dialogOverflow
            )
              failures.push(results.at(-1));
          };
          await check("home", ['[data-action="quick"]']);
          await click("how");
          await check("how");
          await click("home");
          await click("words");
          assert.equal(await page.locator(".empty-state").count(), 1);
          await check("words-empty");
          await page.locator("#word-input").fill("Moon");
          await page
            .locator('[data-form="word"]')
            .evaluate((f) => f.requestSubmit());
          assert.equal(await page.locator("#word-input").inputValue(), "");
          await page.locator("#word-input").fill("Moon");
          await page
            .locator('[data-form="word"]')
            .evaluate((f) => f.requestSubmit());
          assert.equal(await page.locator("#word-input").inputValue(), "Moon");
          await check("word-duplicate");
          await page.locator("#word-input").fill("Draft word");
          await click("language-menu");
          await page.locator(`[data-action="language"][data-value="${lang === "en" ? "zh" : "en"}"]`).click();
          await click("language-back");
          assert.equal(
            await page.locator("#word-input").inputValue(),
            "Draft word",
          );
          await click("language-menu");
          await page.locator(`[data-action="language"][data-value="${lang}"]`).click();
          await click("language-back");
          await check("words");
          await click("home");
          await click("settings");
          await page.locator('.settings-language-row[data-action="language-menu"]').click();
          await page
            .locator(`[data-action="language"][data-value="${lang}"]`)
            .click();
          assert.equal(
            await page
              .locator(`[data-action="language"][data-value="${lang}"]`)
              .getAttribute("aria-pressed"),
            "true",
          );
          assert.equal(
            await page.evaluate(() => document.activeElement.dataset.value),
            lang,
          );
          await click("language-back");
          await check("settings");
          await click("home");
          await click("setup");
          await page.locator("#player-input").fill("Unsubmitted name");
          await page.locator('[data-key="mode"][data-value="teams"]').click();
          assert.equal(
            await page.locator("#player-input").inputValue(),
            "Unsubmitted name",
          );
          const team = page.locator('[data-action="team"]').first();
          assert.ok(
            (await team.getAttribute("aria-label")).includes(
              await team.innerText(),
            ),
          );
          await page
            .locator('[data-key="mode"][data-value="individual"]')
            .click();
          assert.equal(
            await page.evaluate(() => document.activeElement.dataset.value),
            "individual",
          );
          await check("people", ['[data-action="next-step"]']);
          await click("next-step");
          assert.equal(await page.locator(".setup-panel h1").count(), 1);
          await check("style", ['[data-action="next-step"]']);
          await click("next-step");
          await check("cards", ['[data-action="next-step"]']);
          await click("next-step");
          await check("ready", ['[data-action="start-game"]']);
          await click("start-game");
          await check("intro");
          await click("intro-start");
          await check("handoff", ['[data-action="reveal"]']);
          await click("reveal");
          await check("reveal", ['[data-action="draw"]']);
          await click("draw");
          assert.ok(
            await page
              .locator(".compact-tools .tool-caption")
              .evaluateAll((elements) =>
                elements.every(
                  (e) =>
                    getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)",
                ),
              ),
            "tool labels must not inherit the solid brush-sample background",
          );
          await check("drawing", [
            "canvas",
            '[data-action="judge"]',
            '[data-action="give-up"]',
            "#peek",
            "#timer",
            ".compact-tools",
          ]);
          if (scale === 1)
            assert.ok(
              (await page.locator("canvas").boundingBox()).width >= 200,
            );
          for (const s of [
            "#peek",
            '[data-action="judge"]',
            '[data-action="give-up"]',
          ])
            assert.ok(
              await page
                .locator(s)
                .evaluate(
                  (e) => parseFloat(getComputedStyle(e).fontSize) >= 14.9,
                ),
            );
          await click("toggle-pause");
          await check("paused");
          await click("palette");
          await check("palette");
          await page.locator('#palette-dialog [data-action="eraser"]').click();
          assert.equal(
            await page
              .locator('#palette-dialog [data-action="eraser"]')
              .getAttribute("aria-pressed"),
            "true",
          );
          assert.ok(
            await page.evaluate(
              () => !!document.activeElement.closest("#palette-dialog"),
            ),
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.evaluate(() => document.activeElement.dataset.action),
            "palette",
          );
          await click("scores");
          await check("scores");
          await page.keyboard.press("Escape");
          assert.equal(
            await page.evaluate(() => document.activeElement.dataset.action),
            "scores",
          );
          await page.evaluate(() => dispatchEvent(new Event("native-pause")));
          await check("privacy");
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            "privacy-title",
          );
          assert.equal(
            await page.locator(".shell > header").getAttribute("inert"),
            "",
          );
          await click("uncover");
          await click("judge");
          await check("judge");
          await click("correct");
          await check("correct-result");
          await click("next-round");
          await click("reveal");
          await click("draw");
          await click("give-up");
          await check("giveup-result");
          await click("next-round");
          await click("reveal");
          await click("draw");
          await page.evaluate(() => {
            window.realDateNow = Date.now;
            Date.now = () => window.realDateNow() + 121000;
          });
          await page.locator(".result-timeout").waitFor();
          await page.evaluate(() => {
            Date.now = window.realDateNow;
          });
          await check("timeout-result");
          page.once("dialog", (d) => d.accept());
          await click("finish");
          await check("final", ['[data-action="replay"]']);
          await click("replay");
          await check("replay-handoff");
          await click("exit");
          await check("home-resume");
          // Explicit reset is exercised only in this disposable synthetic store.
          await click("settings");
          await page.locator('details[data-disclosure="data"] > summary').click();
          page.once("dialog", (d) => d.accept());
          await click("reset");
          await click("words");
          assert.equal(await page.locator("#word-input").inputValue(), "");
          assert.equal(
            await page.evaluate(() => localStorage.pp_custom_words),
            '["LEGACY PRESERVE"]',
          );
          assert.deepEqual(errors, []);
          await context.close();
        }
  } finally {
    await browser.close();
    if (process.env.RECEIPT)
      fs.writeFileSync(
        process.env.RECEIPT,
        JSON.stringify({ url, results, failures }, null, 2) + "\n",
      );
  }
  console.log(JSON.stringify({ screens: results.length, failures }, null, 2));
  assert.equal(failures.length, 0);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
