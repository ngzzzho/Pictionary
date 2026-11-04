const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
(async () => {
  const { defaults } = await import("../js/profile.mjs");
  const { selectableLocales } = await import("../js/languages.mjs");
  const records = [];
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium" ? chromium : webkit).launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    try {
      for (const native of [false, true]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.addInitScript(
          ({ defaults, native }) => {
            if (!localStorage.sg_v1_profile)
              localStorage.sg_v1_profile = JSON.stringify({
                version: 1,
                language: "en-US",
                muted: true,
                onboardingSeen: true,
                players: Array.from({ length: 12 }, (_, i) => ({
                  id: String(i),
                  name: "P" + i,
                  team: i % 2,
                })),
                custom: ["KEEP MY WORD"],
                settings: { ...defaults, topic: "animals+food", roundsEach: 3 },
              });
            // Synthetic test bridge only. Production code has no query/storage unlock.
            if (native) {
              window.testStore = {
                owned: false,
                result: "cancelled",
                requests: [],
              };
              window.webkit = {
                messageHandlers: {
                  partyPurchase: {
                    postMessage: async ({ action }) => {
                      const s = window.testStore;
                      s.requests.push(action);
                      if (
                        (action === "purchase" && s.result === "purchased") ||
                        (action === "restore" && s.result === "restored")
                      )
                        s.owned = true;
                      return {
                        productId: "com.local.familydraw.fullversion",
                        ready: true,
                        unlocked: s.owned,
                        available: true,
                        price: "HK$ 18.00",
                        result:
                          action === "purchase" || action === "restore"
                            ? s.result
                            : s.owned
                              ? "owned"
                              : "ready",
                      };
                    },
                  },
                },
              };
            }
          },
          { defaults, native },
        );
        await page.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        const click = (action) =>
          page.locator(`[data-action="${action}"]`).first().click();
        await page.locator(".screen-home").waitFor();
        assert.equal(await page.locator(".screen-purchase").count(), 0);
        await click("quick");
        let game = await page.evaluate(() =>
          JSON.parse(localStorage.sg_v1_game),
        );
        assert.equal(game.deck.length, 50);
        assert.equal(game.settings.topic, "mixed");
        assert.equal(game.settings.difficulty, "general");
        const gameBefore = JSON.stringify(game);
        await click("exit");
        await click("words");
        assert.equal(await page.locator("#word-input").count(), 0);
        assert.ok(
          (await page.locator(".word-chips").innerText()).includes(
            "KEEP MY WORD",
          ),
        );
        await click("purchase-menu");
        if (!native) {
          assert.equal(
            await page.locator('[data-action="purchase-buy"]').isDisabled(),
            true,
          );
          await click("purchase-restore");
          assert.equal(
            await page.locator(".purchase-status").innerText(),
            "Purchases are currently unavailable. You can keep playing free.",
          );
        } else {
          await page.locator('[data-action="purchase-buy"]:enabled').waitFor();
          assert.ok(
            (
              await page.locator('[data-action="purchase-buy"]').innerText()
            ).includes("HK$ 18.00"),
          );
          await click("purchase-buy");
          assert.match(
            await page.locator(".purchase-status").innerText(),
            /cancelled/,
          );
          await page.evaluate(() => (window.testStore.result = "pending"));
          await click("purchase-buy");
          assert.match(
            await page.locator(".purchase-status").innerText(),
            /approval/,
          );
          await page.evaluate(() => (window.testStore.result = "purchased"));
          await click("purchase-buy");
          assert.match(
            await page.locator(".purchase-status").innerText(),
            /Purchase complete/,
          );
          assert.equal(
            await page.locator('[data-action="purchase-buy"]').count(),
            0,
          );
          assert.equal(
            await page.evaluate(() => localStorage.sg_v1_game),
            gameBefore,
            "Buying must not rewrite the running game",
          );
          await click("purchase-back");
          assert.equal(await page.locator("#word-input").count(), 1);
          await click("home");
          const retainedHome = await page.evaluate(async () => {
            const scene = document.querySelector(".screen-home");
            for (let i = 0; i < 20; i++) {
              window.dispatchEvent(new Event("native-active"));
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            return scene === document.querySelector(".screen-home");
          });
          assert.equal(retainedHome, true, "Unchanged foreground entitlement must retain the scene DOM");
          await click("setup");
          await page.locator('[data-action="step"][data-step="2"]').click();
          assert.ok(await page.locator('[data-disclosure="subjects"]').count());
          await click("home");
          await click("settings");
          await click("purchase-menu");
          await page.evaluate(() => (window.testStore.result = "restored"));
          await click("purchase-restore");
          assert.match(
            await page.locator(".purchase-status").innerText(),
            /restored/,
          );
          await page.evaluate(() => {
            window.testStore.owned = false;
            window.dispatchEvent(new Event("purchase-status-changed"));
          });
          await page.locator('[data-action="purchase-buy"]').waitFor();
          assert.equal(
            await page.evaluate(() => localStorage.sg_v1_game),
            gameBefore,
            "Revocation keeps old games intact",
          );
        }
        await click("purchase-back");
        await click("home");
        await click("setup");
        await page.locator('[data-action="step"][data-step="1"]').click();
        assert.equal(
          await page.locator('[data-key="roundsEach"][data-value="3"]').count(),
          0,
        );
        await page.locator('[data-action="step"][data-step="2"]').click();
        assert.equal(
          await page.locator('[data-disclosure="subjects"]').count(),
          0,
        );
        assert.equal(await page.locator("#card-primary").count(), 1);
        const stored = await page.evaluate(() =>
          JSON.parse(localStorage.sg_v1_profile),
        );
        assert.equal(stored.settings.topic, "animals+food");
        assert.equal(stored.settings.roundsEach, 3);
        assert.deepEqual(stored.custom, ["KEEP MY WORD"]);
        // Purchase copy geometry in all 15 interface choices, phone orientations and large text.
        let geometry = 0;
        for (const { code } of selectableLocales) {
          await page.evaluate((code) => {
            const p = JSON.parse(localStorage.sg_v1_profile);
            p.language = code;
            localStorage.sg_v1_profile = JSON.stringify(p);
          }, code);
          await page.reload();
          await click("purchase-menu");
          for (const [width, height, large] of [
            [390, 844, false],
            [844, 390, false],
            [320, 568, true],
          ]) {
            await page.setViewportSize({ width, height });
            await page.evaluate((large) => {
              document.documentElement.classList.toggle("large-text", large);
              document.documentElement.style.setProperty(
                "--text-scale",
                large ? "2" : "1",
              );
            }, large);
            const metric = await page.evaluate(() => ({
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              buttons: [...document.querySelectorAll(".purchase-panel button")]
                .filter((b) => !b.disabled)
                .every((b) => b.getBoundingClientRect().height >= 44),
            }));
            assert.equal(metric.overflow, false, code + ":" + width);
            assert.equal(metric.buttons, true);
            geometry++;
          }
          await page.setViewportSize({ width: 390, height: 844 });
        }
        assert.deepEqual(errors, []);
        records.push({
          engine,
          native,
          geometry,
          free50: true,
          preserved: true,
        });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/purchases/browser.json",
    JSON.stringify({ records }, null, 2),
  );
  console.log(records);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
