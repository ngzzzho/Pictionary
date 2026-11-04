// Isolated synthetic profiles; no user storage or licensed pixel capture.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const { defaults } = await import("../js/profile.mjs");
  const { selectableLocales: locales } = await import("../js/languages.mjs");
  const records = [];
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "webkit" ? webkit : chromium).launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      await page.addInitScript(
        (settings) => {
          if (localStorage.getItem("sg_v1_profile")) return;
          localStorage.sg_v1_profile = JSON.stringify({
            version: 1,
            language: "en",
            muted: true,
            onboardingSeen: true,
            players: [
              { id: "a", name: "A", team: 0 },
              { id: "b", name: "B", team: 1 },
            ],
            custom: ["KEPT"],
            settings,
          });
        },
        { ...defaults, cardLanguage: "ja+ar" },
      );
      await page.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
      const click = (action) =>
        page.locator(`[data-action="${action}"]`).first().click();
      await click("setup");
      await page.locator("#player-input").fill("未提交の名前");
      await click("language-menu");
      await page.locator('[data-action="language"][data-value="ko"]').click();
      await page.locator('header [data-action="language-back"]').click();
      assert.equal(
        await page.locator("#player-input").inputValue(),
        "未提交の名前",
      );
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.sg_v1_profile).settings.cardLanguage,
        ),
        "ko+ar",
      );
      await click("home");
      await click("words");
      await page.locator("#word-input").fill("كلمة 原文");
      await click("language-menu");
      await page.locator('[data-action="language"][data-value="ar"]').click();
      await page.locator('header [data-action="language-back"]').click();
      assert.equal(await page.locator("#word-input").inputValue(), "كلمة 原文");
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.sg_v1_profile),
      );
      assert.equal(saved.language, "ar");
      assert.equal(saved.settings.cardLanguage, "ar");
      assert.deepEqual(saved.custom, ["KEPT"]);
      assert.equal(saved.players.length, 2);
      await click("home");
      await click("settings");
      // A committed native picker must not be replaced or programmatically
      // refocused: that opens the iOS selection sheet a second time.
      const chooseCardLanguage = async (id, value) => {
        await page.locator(id).focus();
        await page.evaluate((selector) => {
          window.pickerBefore = document.querySelector(selector);
          window.pickerFocusEvents = 0;
          window.pickerBefore.addEventListener("focus", () => window.pickerFocusEvents++);
          window.pickerScroll = window.scrollY;
        }, id);
        await page.selectOption(id, value);
        const state = await page.evaluate((selector) => ({
          sameNode: document.querySelector(selector) === window.pickerBefore,
          stillFocused: document.activeElement === window.pickerBefore,
          focusEvents: window.pickerFocusEvents,
          sameScroll: window.scrollY === window.pickerScroll,
        }), id);
        assert.deepEqual(state, {
          sameNode: true, stillFocused: true, focusEvents: 0, sameScroll: true,
        });
      };
      await chooseCardLanguage("#card-primary", "ja");
      await chooseCardLanguage("#card-secondary", "ar");
      await chooseCardLanguage("#card-primary", "ar");
      assert.equal(await page.locator("#card-secondary").inputValue(), "");
      assert.equal(await page.locator('#card-secondary option[value="ar"]').count(), 0);
      await chooseCardLanguage("#card-primary", "ja");
      await chooseCardLanguage("#card-secondary", "ar");
      await chooseCardLanguage("#card-secondary", "");
      await chooseCardLanguage("#card-secondary", "ar");
      await click("home");
      await click("quick");
      await click("exit");
      await click("settings");
      for (const { code } of locales) {
        await page.selectOption("#card-primary", "ja");
        await page.selectOption("#card-secondary", "ar");
        await page
          .locator('.settings-language-row[data-action="language-menu"]')
          .click();
        await page
          .locator(`[data-action="language"][data-value="${code}"]`)
          .click();
        await page.locator('header [data-action="language-back"]').click();
        assert.equal(await page.locator("#card-primary").inputValue(), code);
        assert.equal(
          await page.locator("#card-secondary").inputValue(),
          code === "ar" ? "" : "ar",
        );
        const state = await page.evaluate(() => ({
          profile: JSON.parse(localStorage.sg_v1_profile),
          game: JSON.parse(localStorage.sg_v1_game),
        }));
        assert.equal(state.profile.language, code);
        assert.equal(
          state.profile.settings.cardLanguage,
          code === "ar" ? "ar" : `${code}+ar`,
        );
        assert.equal(state.game.settings.cardLanguage, "ja+ar");
      }
      // A later explicit card override remains independent and survives reload.
      await page.selectOption("#card-primary", "fr");
      await page.selectOption("#card-secondary", "ar");
      await page.reload();
      await click("settings");
      assert.equal(await page.locator("#card-primary").inputValue(), "fr");
      assert.equal(await page.locator("#card-secondary").inputValue(), "ar");
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.sg_v1_profile).language,
        ),
        "ar",
      );
      records.push({
        engine,
        interfaceChoicesVerified: locales.length,
        activeGamePreserved: true,
        manualCardOverrideSurvivesReload: true,
        cardPickerPreservesNodeFocusAndScroll: true,
        playerDraftPreserved: true,
        wordDraftPreserved: true,
        primaryFollowsInterfaceAndDuplicateRemoved: true,
        unsubmittedDataNotWritten: true,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/localization/navigation.json",
    JSON.stringify({ records }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ flows: records.length, failures: 0 }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
