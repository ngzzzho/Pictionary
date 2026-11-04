// Synthetic, isolated stores; DOM geometry only. Never captures screenshots/pixels.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const base = process.env.TEST_URL || "http://127.0.0.1:8766/";
const baseline = process.env.BASELINE === "1";
const languages = (
  process.env.TEST_LANGUAGES || "en,zh,zh-Hans,ja,ko,de,fr,es,pt,it,ar"
).split(",");
const results = [],
  failures = [];
let buildAssetsBefore;
async function buildAssets() {
  const pairs = await Promise.all(
    ["index.html", "js/app.js", "css/compact-ui.css"].map(async (name) => {
      const response = await fetch(new URL(name, base), { cache: "no-store" });
      return [
        name,
        {
          status: response.status,
          sha256: createHash("sha256")
            .update(Buffer.from(await response.arrayBuffer()))
            .digest("hex"),
        },
      ];
    }),
  );
  return Object.fromEntries(pairs);
}
const record = (name, result, expected) => {
  results.push({ name, ...result });
  for (const [key, pass] of Object.entries(expected))
    if (!pass) failures.push({ name, key, ...result });
};
(async () => {
  buildAssetsBefore = await buildAssets();
  const { defaults } = await import("../js/profile.mjs");
  const profile = (language) => ({
    version: 1,
    language,
    muted: true,
    onboardingSeen: true,
    players: ["Mia", "Leo", "Ava", "Sam"].map((name, i) => ({
      id: `synthetic-${i}`,
      name,
      team: i % 2,
    })),
    custom: [],
    settings: { ...defaults, mode: "individual", cardLanguage: language },
  });
  const engines = process.env.TEST_ENGINE
    ? [process.env.TEST_ENGINE]
    : ["chromium", "webkit"];
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
    });
    async function pageFor(
      language,
      width,
      height,
      scale = 1,
      playerCount = 4,
      mode = "individual",
    ) {
      const context = await browser.newContext({
        viewport: { width, height },
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.addInitScript(
        ({ profile, scale }) => {
          localStorage.sg_v1_profile = JSON.stringify(profile);
          addEventListener("DOMContentLoaded", () => {
            document.documentElement.style.setProperty("--text-scale", scale);
            document.documentElement.classList.toggle(
              "large-text",
              scale > 1.35,
            );
          });
        },
        {
          profile: {
            ...profile(language),
            players: Array.from({ length: playerCount }, (_, i) => ({
              id: `synthetic-${i}`,
              name: ["Mia", "Leo", "Ava", "Sam"][i] || `Player ${i + 1}`,
              team: i % 2,
            })),
            settings: { ...profile(language).settings, mode },
          },
          scale,
        },
      );
      await page.goto(base);
      // Match iPhone portrait status/home indicator insets without rendering its pixels.
      if (width === 393 && height === 852)
        await page.addStyleTag({
          content:
            ".shell{padding-top:59px!important;padding-bottom:34px!important}.screen-setup{padding-bottom:calc(var(--forward-height,82px) + 26px)!important}:root.large-text .screen-setup{padding-bottom:34px!important}",
        });
      await page.evaluate(() => document.fonts.ready);
      return { context, page };
    }
    async function audit(page, name, mustFit = false, words = false) {
      if (!mustFit)
        await page.locator(".bottom-actions").scrollIntoViewIfNeeded();
      const r = await page.evaluate(() => {
        const panel = document.querySelector(".setup-panel"),
          footer = document.querySelector(".bottom-actions");
        const pr = panel.getBoundingClientRect(),
          fr = footer.getBoundingClientRect();
        const numeralTops = [
          ...document.querySelectorAll(".steps button>span:first-child"),
        ].map((x) => x.getBoundingClientRect().top);
        const broken = [];
        for (const el of footer.querySelectorAll("button span")) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            for (const m of n.textContent.matchAll(/[A-Za-z]+/g)) {
              const range = document.createRange();
              range.setStart(n, m.index);
              range.setEnd(n, m.index + m[0].length);
              if (
                new Set(
                  [...range.getClientRects()].map((x) => Math.round(x.top)),
                ).size > 1
              )
                broken.push(m[0]);
            }
          }
        }
        return {
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          panelScroll: panel.scrollHeight - panel.clientHeight,
          documentScroll: document.documentElement.scrollHeight - innerHeight,
          panelBottom: Math.min(pr.bottom, document.querySelector(".screen-setup").getBoundingClientRect().bottom),
          footerTop: fr.top,
          footerBottom: fr.bottom,
          footerHeight: fr.height,
          numeralDelta: Math.max(...numeralTops) - Math.min(...numeralTops),
          broken,
        };
      });
      record(name, r, {
        horizontal: r.documentOverflow <= 2 && r.panelOverflow <= 2,
        footerReachable:
          r.footerTop >= -1 &&
          r.footerBottom <= (await page.evaluate(() => innerHeight)) + 2,
        noFooterOverlay: r.panelBottom <= r.footerTop + 2,
        ...(mustFit ? { numeralsAligned: r.numeralDelta <= 2 } : {}),
        ...(mustFit
          ? { fitsCommonScreen: r.panelScroll <= 2 && r.documentScroll <= 2 }
          : {}),
        ...(words ? { unbrokenEnglishActions: r.broken.length === 0 } : {}),
      });
    }
    try {
      for (const language of process.env.FLOWS_ONLY ? [] : ["en", "zh"]) {
        const { context, page } = await pageFor(language, 393, 852);
        await page.locator('[data-action="setup"]').first().click();
        for (let step = 0; step < 4; step++) {
          await page
            .locator(`[data-action="step"][data-step="${step}"]`)
            .click();
          await audit(
            page,
            `${engine}/${language}/393x852/default/step${step}`,
            true,
            language === "en",
          );
        }
        await context.close();
      }
      if (!baseline) {
        for (const language of process.env.FLOWS_ONLY ? [] : languages)
          for (const [width, height] of [
            [320, 568],
            [852, 393],
          ])
            for (const scale of [1, 2, 3.12]) {
              const { context, page } = await pageFor(
                language,
                width,
                height,
                scale,
              );
              await page.locator('[data-action="setup"]').first().click();
              for (const step of [0, 2]) {
                await page
                  .locator(`[data-action="step"][data-step="${step}"]`)
                  .click();
                await audit(
                  page,
                  `${engine}/${language}/${width}x${height}/scale${scale}/step${step}`,
                );
              }
              await context.close();
            }
        for (const [count, mode] of [
          [0, "individual"],
          [2, "individual"],
          [12, "individual"],
          [4, "teams"],
          [12, "teams"],
        ]) {
          const r = await pageFor("en", 393, 852, 1, count, mode);
          await r.page.locator('[data-action="setup"]').first().click();
          const roster = await r.page.evaluate(() => {
            const panel = document.querySelector(".setup-panel");
            panel.scrollTop = panel.scrollHeight;
            const reachedBottom = Math.abs(panel.scrollTop - (panel.scrollHeight-panel.clientHeight)) <= 2;
            // Team-name fields now follow the roster. Reach its last row directly,
            // rather than assuming that row remains visible at the form's bottom.
            document.querySelector('.player-row:last-child')?.scrollIntoView({block:'nearest'});
            const pr = panel.getBoundingClientRect(),
              footer = document
                .querySelector(".bottom-actions")
                .getBoundingClientRect(),
              rows = [...document.querySelectorAll(".player-row")],
              last = rows.at(-1)?.getBoundingClientRect();
            return {
              count: rows.length,
              reachedBottom,
              scrollTop: panel.scrollTop,
              scrollMax: panel.scrollHeight - panel.clientHeight,
              panelBottom: Math.min(pr.bottom, document.querySelector(".screen-setup").getBoundingClientRect().bottom),
              footerTop: footer.top,
              footerBottom: footer.bottom,
              overflow: document.documentElement.scrollWidth - innerWidth,
              lastReachable:
                !last || (last.top >= pr.top && last.bottom <= pr.bottom),
            };
          });
          record(`${engine}/roster-${count}-${mode}`, roster, {
            playerCount: roster.count === count,
            footerOutside: roster.panelBottom <= roster.footerTop + 2,
            footerVisible: roster.footerBottom <= 852,
            lastPlayerReachable: roster.lastReachable,
            scrollWorks: roster.reachedBottom,
            noHorizontal: roster.overflow <= 2,
          });
          await r.context.close();
        }
        const { context, page } = await pageFor("en", 393, 852);
        await page.locator('[data-action="setup"]').first().click();
        await page.locator('[data-action="step"][data-step="2"]').click();
        const subjects = page.locator('details[data-disclosure="subjects"]');
        const preview = page.locator('details[data-disclosure="card-preview"]');
        record(
          `${engine}/disclosures-initial`,
          {},
          {
            subjectsClosed: !(await subjects.evaluate((x) => x.open)),
            previewClosed: !(await preview.evaluate((x) => x.open)),
          },
        );
        await subjects.locator("summary").click();
        const topic = subjects.locator('[data-action="topic-toggle"]').last();
        await topic.scrollIntoViewIfNeeded();
        await topic.click();
        record(
          `${engine}/subjects-selection`,
          {},
          { openAfterToggle: await subjects.evaluate((x) => x.open) },
        );
        await page.locator('[data-action="topics-done"]').click();
        record(
          `${engine}/subjects-done`,
          {},
          { closedAfterDone: !(await subjects.evaluate((x) => x.open)) },
        );
        await page.locator('[data-action="step"][data-step="0"]').click();
        // Synthetic visualViewport keyboard contract, not physical keyboard evidence.
        await page.locator("#player-input").focus();
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", {
            configurable: true,
            value: innerHeight - 300,
          });
          visualViewport.dispatchEvent(new Event("resize"));
        });
        const keyboard = await page.evaluate(() => {
          const controls = [
            "#player-input",
            ".add-button",
            '[data-action="next-step"]',
          ].map((selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return {
              selector,
              top: r.top,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          });
          return {
            height: parseFloat(
              document.documentElement.style.getPropertyValue(
                "--visible-height",
              ),
            ),
            keyboardOpen:
              document.documentElement.classList.contains("keyboard-open"),
            overflow: document.documentElement.scrollWidth - innerWidth,
            controls,
          };
        });
        record(`${engine}/synthetic-keyboard-open`, keyboard, {
          heightUpdated: Math.abs(keyboard.height - 552) <= 1,
          keyboardOpen: keyboard.keyboardOpen,
          noOuterOverflow: keyboard.overflow <= 2,
          controlsReachable: keyboard.controls.every(
            (r) =>
              r.top >= 0 && r.bottom <= 552 && r.width >= 43 && r.height >= 43,
          ),
        });
        await page.evaluate(() => {
          delete visualViewport.height;
          document.activeElement.blur();
          visualViewport.dispatchEvent(new Event("resize"));
        });
        const restored = await page.evaluate(() => ({
          height: parseFloat(
            document.documentElement.style.getPropertyValue("--visible-height"),
          ),
          keyboardOpen:
            document.documentElement.classList.contains("keyboard-open"),
        }));
        record(`${engine}/synthetic-keyboard-restore`, restored, {
          heightRestored: Math.abs(restored.height - 852) <= 1,
          keyboardClosed: !restored.keyboardOpen,
        });
        // Force a genuine tall roster without touching player storage outside this context.
        for (let i = 4; i < 12; i++) {
          await page.locator("#player-input").fill(`Player ${i}`);
          await page.locator("#player-input").press("Enter");
        }
        const panel = page.locator(".setup-panel");
        const mode = page.locator('[data-key="mode"][data-value="teams"]');
        await mode.scrollIntoViewIfNeeded();
        const before = await panel.evaluate((x) => x.scrollTop);
        await mode.click();
        const after = await panel.evaluate((x) => x.scrollTop);
        record(
          `${engine}/same-step-scroll`,
          { before, after },
          {
            realScrollable: before > 20,
            preserved: Math.abs(before - after) <= 2,
          },
        );
        await page.locator('header [data-action="settings"]').click();
        record(
          `${engine}/settings-language`,
          {},
          {
            noInlineGrid: (await page.locator(".language-grid").count()) === 0,
            languageMenu:
              (await page
                .locator('.panel [data-action="language-menu"]')
                .count()) === 1,
            cardSelectors:
              (await page.locator("#card-primary").isVisible()) &&
              (await page.locator("#card-secondary").isVisible()),
          },
        );
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--text-scale", 2);
          document.documentElement.classList.add("large-text");
        });
        const sound = page.locator('[data-action="sound"]');
        await sound.scrollIntoViewIfNeeded();
        const soundBefore = await page.evaluate(() => scrollY);
        await sound.click();
        const soundAfter = await page.evaluate(() => scrollY);
        record(
          `${engine}/settings-scroll`,
          { before: soundBefore, after: soundAfter },
          {
            realScrollable: soundBefore > 20,
            preserved: Math.abs(soundBefore - soundAfter) <= 2,
          },
        );
        await context.close();
        // Upgrade synthetic v1 artwork records through the same production migration path.
        const g = await pageFor("en", 393, 852);
        await g.page.locator('[data-action="gallery"]').click();
        // Finish the initial empty-archive index before deleting its marker
        // and seeding legacy records; otherwise that in-flight index can put
        // "catalogued" back after the synthetic transaction.
        await g.page.locator(".gallery-empty").waitFor();
        await g.page.locator('[data-action="gallery-back"]').click();
        await g.page.evaluate(async () => {
          const db = await new Promise((ok, no) => {
            const r = indexedDB.open("sg_artwork_v1");
            r.onsuccess = () => ok(r.result);
            r.onerror = () => no(r.error);
          });
          await new Promise((ok, no) => {
            const tx = db.transaction(["drawings", "recovery"], "readwrite");
            tx.objectStore("recovery").delete("catalogued");
            for (let i = 0; i < 31; i++)
              tx.objectStore("drawings").put({
                version: 1,
                id: `game-${1791880000000 + Math.floor(i / 11) * 1000}:${(i % 11) + 1}`,
                ratio: 1,
                strokes: [
                  {
                    color: "#243450",
                    width: 7,
                    points: [
                      [0.1, 0.2],
                      [0.7, 0.8],
                    ],
                  },
                ],
              });
            tx.oncomplete = ok;
            tx.onabort = () => no(tx.error);
          });
          db.close();
        });
        await g.page.locator('[data-action="gallery"]').click();
        await g.page.waitForFunction(
          () => document.querySelectorAll(".gallery-card").length === 12,
        );
        await g.page.locator('[data-action="gallery-more"]').click();
        await g.page.waitForFunction(
          () => document.querySelectorAll(".gallery-card").length === 24,
        );
        const favourite = g.page
          .locator('[data-action="gallery-favourite"]')
          .nth(20);
        await favourite.scrollIntoViewIfNeeded();
        const galleryBefore = await g.page.evaluate(() => scrollY);
        await favourite.click();
        await g.page.waitForFunction(
          () =>
            !!document.querySelector('.gallery-favourite[aria-pressed="true"]'),
        );
        const galleryAfter = await g.page.evaluate(() => scrollY),
          count = await g.page.locator(".gallery-card").count();
        record(
          `${engine}/gallery-favourite-scroll`,
          { before: galleryBefore, after: galleryAfter, count },
          {
            retainsLoadedPage: count >= 24,
            preserved: Math.abs(galleryBefore - galleryAfter) <= 2,
          },
        );
        await g.page.setViewportSize({ width: 320, height: 568 });
        await g.page.evaluate(() => {
          document.documentElement.style.setProperty("--text-scale", 3.12);
          document.documentElement.classList.add("large-text");
          window.webkit = {
            messageHandlers: {
              partyArtwork: {
                postMessage: async () => ({ status: "cancelled" }),
              },
            },
          };
        });
        await g.page.locator('[data-action="gallery-open"]').nth(20).click();
        const share = g.page.locator('[data-action="share-artwork"]:enabled');
        await share.waitFor();
        await share.scrollIntoViewIfNeeded();
        const maxDialogScroll = await g.page.locator("#artwork-dialog").evaluate(x => {
          const max = x.scrollHeight - x.clientHeight;
          x.scrollTop = Math.min(80, max);
          return max;
        });
        const dialogBefore = await g.page
          .locator("#artwork-dialog")
          .evaluate((x) => x.scrollTop);
        await share.click();
        await g.page.waitForFunction(
          () =>
            !document.querySelector('[data-action="share-artwork"]').disabled,
        );
        const dialogAfter = await g.page
          .locator("#artwork-dialog")
          .evaluate((x) => x.scrollTop);
        record(
          `${engine}/dialog-scroll`,
          { before: dialogBefore, after: dialogAfter },
          {
            accessibleContent: maxDialogScroll <= 20 || dialogBefore > 20,
            preserved: Math.abs(dialogBefore - dialogAfter) <= 2,
          },
        );
        await g.context.close();
      }
    } finally {
      await browser.close();
    }
  }
  const buildAssetsAfter = await buildAssets();
  record(
    "unchanged-build-during-run",
    {},
    {
      sameBuild:
        JSON.stringify(buildAssetsBefore) === JSON.stringify(buildAssetsAfter),
    },
  );
  const receipt = {
    base,
    baseline,
    buildAssetsBefore,
    buildAssetsAfter,
    caseCount: results.length,
    failures,
    results,
  };
  if (process.env.RECEIPT) {
    fs.mkdirSync(path.dirname(process.env.RECEIPT), { recursive: true });
    fs.writeFileSync(process.env.RECEIPT, JSON.stringify(receipt, null, 2));
  }
  console.log(
    JSON.stringify(
      {
        base,
        baseline,
        caseCount: results.length,
        failureCount: failures.length,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  const receipt = {
    base,
    baseline,
    caseCount: results.length,
    failures,
    results,
    error: String(error),
  };
  if (process.env.RECEIPT)
    fs.writeFileSync(process.env.RECEIPT, JSON.stringify(receipt, null, 2));
  console.error(error);
  console.log(
    JSON.stringify(
      { caseCount: results.length, failureCount: failures.length, failures },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
