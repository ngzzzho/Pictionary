// Structural Batch 1 skin regression. Never captures screenshots or reads rendered pixels.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
const manifestPath = path.join(root, "scripts/layerlab-assets.json");
const slicesPath = path.join(root, "css/layerlab-slices.css");
const manifestText = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const byFile = new Map(
  manifest.map((asset) => [asset.file.replaceAll("\\", "/"), asset]),
);
const checks = [];

function report(name) {
  checks.push(name);
}

function assetPathsFromCss(cssText) {
  return [...cssText.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)]
    .map((match) => match[1].replaceAll("\\", "/"))
    .filter((src) =>
      /(?:^|\/)assets\/layerlab\/[^/]+\.png(?:[?#].*)?$/i.test(src),
    );
}

function normalizeAssetReference(src, stylesheetUrl) {
  const parsed = new URL(src, stylesheetUrl);
  const marker = "/assets/layerlab/";
  const index = parsed.pathname.indexOf(marker);
  return index < 0
    ? null
    : `assets/layerlab/${parsed.pathname.slice(index + marker.length)}`;
}

(async () => {
  const slicesText = fs.readFileSync(slicesPath, "utf8");
  const manifestDigest = crypto
    .createHash("sha256")
    .update(manifestText)
    .digest("hex");
  const digestInCss = slicesText.match(
    /manifest-sha256:\s*([a-f0-9]{64})/i,
  )?.[1];
  assert.equal(
    digestInCss,
    manifestDigest,
    "generated slicing CSS must match the current manifest",
  );
  assert.equal(
    manifest.length,
    byFile.size,
    "manifest asset paths must be unique",
  );

  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      localStorage.sg_v1_profile = JSON.stringify({
        version: 1,
        language: "en",
        muted: true,
        onboardingSeen: true,
        players: [
          { id: "skin-1", name: "Player One", team: 0 },
          { id: "skin-2", name: "Player Two", team: 1 },
          { id: "skin-3", name: "Player Three", team: 0 },
        ],
        custom: [],
        settings: {
          mode: "individual",
          surface: "canvas",
          topic: "mixed",
          difficulty: "easy",
          cardLanguage: "both",
          seconds: 30,
          roundsEach: 1,
        },
      });
    });
    const click = (action) =>
      page.locator(`[data-action="${action}"]`).first().click();

    await page.goto(url);
    await page.locator(".hero").waitFor();
    const documentUrl = new URL(url.endsWith("/") ? url : `${url}/`);
    const stylesheetUrls = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) => links.map((link) => link.href));
    const cssSources = [];
    for (const stylesheetUrl of stylesheetUrls) {
      const response = await context.request.get(stylesheetUrl);
      assert.equal(
        response.status(),
        200,
        `stylesheet must load: ${stylesheetUrl}`,
      );
      cssSources.push({ url: stylesheetUrl, text: await response.text() });
    }
    const referenced = new Set();
    const trackImageReferences = async () => {
      const imgReferences = await page
        .locator("img")
        .evaluateAll((images) =>
          images.map((image) => image.currentSrc || image.src),
        );
      for (const src of imgReferences) {
        const normalized = normalizeAssetReference(src, documentUrl.href);
        if (!normalized) continue;
        assert.ok(
          byFile.has(normalized),
          `image asset must be declared in manifest: ${normalized}`,
        );
        referenced.add(normalized);
      }
    };
    for (const sheet of cssSources) {
      for (const src of assetPathsFromCss(sheet.text)) {
        const normalized = normalizeAssetReference(src, sheet.url);
        assert.ok(
          normalized,
          `LayerLab CSS reference must resolve to a local asset: ${src}`,
        );
        assert.ok(
          byFile.has(normalized),
          `stylesheet asset must be declared in manifest: ${normalized}`,
        );
        referenced.add(normalized);
      }
    }
    for (const stylesheet of cssSources) {
      if (stylesheet.url.endsWith("/css/layerlab-slices.css")) {
        const generatedRefs = assetPathsFromCss(stylesheet.text)
          .map((src) => normalizeAssetReference(src, stylesheet.url))
          .filter(Boolean);
        for (const file of generatedRefs)
          assert.ok(
            byFile.has(file),
            `generated CSS asset must be in manifest: ${file}`,
          );
      }
    }
    assert.ok(
      stylesheetUrls.some((href) => href.endsWith("/css/layerlab-slices.css")),
      "the page must load generated LayerLab slicing CSS",
    );

    await trackImageReferences();

    // Fetch every manifest asset through the isolated browser context and keep bytes in memory.
    for (const asset of manifest) {
      const assetUrl = new URL(asset.file, documentUrl).href;
      const response = await context.request.get(assetUrl);
      assert.equal(
        response.status(),
        200,
        `manifest asset must return HTTP 200: ${asset.file}`,
      );
      const bytes = await response.body();
      const digest = crypto.createHash("sha256").update(bytes).digest("hex");
      assert.equal(
        bytes.length,
        asset.bytes,
        `manifest byte count must match: ${asset.file}`,
      );
      assert.equal(
        digest,
        asset.sha256,
        `manifest SHA-256 must match: ${asset.file}`,
      );
    }
    report(
      `all ${manifest.length} manifest assets return HTTP 200 and match local hashes`,
    );
    report(
      `${referenced.size} CSS/HTML asset references are declared in the manifest`,
    );

    const assertSkin = async (selector, label = selector) => {
      const elements = page.locator(selector);
      const count = await elements.count();
      assert.ok(count > 0, `${label} should be present in this view`);
      for (let index = 0; index < count; index++) {
        const skinned = await elements.nth(index).evaluate((element) => {
          const packImage =
            element.matches(".pack-icon") ||
            element.querySelector(".pack-icon");
          const borderSource = (node, pseudo) =>
            getComputedStyle(node, pseudo).borderImageSource !== "none";
          return Boolean(
            packImage ||
              borderSource(element, null) ||
              borderSource(element, "::before") ||
              borderSource(element, "::after"),
          );
        });
        assert.ok(
          skinned,
          `${label} item ${index + 1} needs a pack image or border-image skin`,
        );
      }
    };
    const noThinGlyphs = async (where) => {
      const count = await page.locator(".ui-glyph").count();
      assert.equal(
        count,
        0,
        `retired thin-line .ui-glyph must not render on ${where}`,
      );
    };
    const checkTargets = async (where) => {
      const short = await page
        .locator("button:visible, input:visible, select:visible")
        .evaluateAll((nodes) =>
          nodes.flatMap((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44
              ? [
                  {
                    tag: node.tagName,
                    action: node.getAttribute("data-action"),
                    width: rect.width,
                    height: rect.height,
                  },
                ]
              : [];
          }),
        );
      assert.deepEqual(
        short,
        [],
        `visible controls should provide 44px targets on ${where}`,
      );
    };

    await assertSkin(".feature", "home feature");
    await trackImageReferences();
    await assertSkin(".btn");
    await noThinGlyphs("home");
    await checkTargets("home");
    await click("setup");
    await assertSkin(".panel");
    await assertSkin(".btn");
    await assertSkin(".player-row");
    await assertSkin("input", "player input");
    await trackImageReferences();
    await noThinGlyphs("setup players");
    await checkTargets("setup players");
    await click("next-step");
    await assertSkin(".choice");
    await assertSkin(".option");
    await checkTargets("setup game options");
    await click("next-step");
    await assertSkin(".topic");
    await assertSkin(".option");
    await checkTargets("setup topic options");
    await trackImageReferences();
    await noThinGlyphs("setup topic selection");
    await click("next-step");
    await assertSkin(".panel");
    await click("start-game");
    await page.locator(".handoff-stage").waitFor();
    // Full-screen character stages intentionally have no enclosing panel.
    await assertSkin(".handoff-stage .btn", "handoff action");
    await trackImageReferences();
    await noThinGlyphs("handoff");

    await click("reveal");
    await page.locator(".reveal-stage").waitFor();
    await assertSkin(".reveal-stage .word-card", "secret word ticket");
    await assertSkin(".reveal-stage .btn", "reveal actions");
    await trackImageReferences();
    await click("draw");
    await page.locator("#timer").waitFor();
    await assertSkin(".btn");
    await assertSkin("#timer");
    await assertSkin(".time-track", "timer track");
    const progress = page.locator("#time-progress");
    assert.equal(await progress.getAttribute("role"), "progressbar");
    const initialProgress = Number(
      await progress.getAttribute("aria-valuenow"),
    );
    await page.waitForFunction(
      (initial) =>
        Number(
          document
            .querySelector("#time-progress")
            ?.getAttribute("aria-valuenow"),
        ) < initial,
      initialProgress,
      { timeout: 5000 },
    );

    await click("scores");
    await page.locator("#scores-dialog").waitFor();
    await assertSkin("#scores-dialog", "scores dialog");
    await assertSkin(".score-row");
    await trackImageReferences();
    await page.locator('#scores-dialog [data-action="scores"]').click();
    await click("palette");
    await page.locator("#palette-dialog").waitFor();
    await assertSkin("#palette-dialog", "palette dialog");
    await trackImageReferences();
    await click("close-palette");
    await click("judge");
    await page.locator("#judge-dialog").waitFor();
    await assertSkin("#judge-dialog", "judge dialog");
    await assertSkin(".guesser");
    await trackImageReferences();
    await noThinGlyphs("judge");
    await page.locator('[data-action="correct"]').first().click();
    await page.locator(".result-emblem").waitFor();
    await assertSkin(".panel");
    await trackImageReferences();
    await noThinGlyphs("round result");
    await click("next-round");
    await page.locator(".handoff-stage").waitFor();
    await click("reveal");
    await click("draw");
    await assertSkin("#timer");
    await click("judge");
    await assertSkin("#judge-dialog", "judge dialog");
    await page.locator('[data-action="correct"]').first().click();
    await page.locator(".result-emblem").waitFor();
    await click("next-round");
    await page.locator(".handoff-stage").waitFor();
    await click("reveal");
    await click("draw");
    await assertSkin("#timer");
    await click("judge");
    await assertSkin("#judge-dialog", "judge dialog");
    await page.locator('[data-action="correct"]').first().click();
    await page.locator(".result-emblem").waitFor();
    await click("next-round");
    await page.locator(".celebration").waitFor();
    await assertSkin(".panel");
    await assertSkin(".score-row");
    await trackImageReferences();
    await noThinGlyphs("final results");
    await checkTargets("final results");

    assert.deepEqual(
      pageErrors,
      [],
      "representative flow should not emit uncaught page errors",
    );
    report(
      "home, setup, handoff, reveal, draw, palette, judge, results, scores, and final flow passed structural skin checks",
    );
    console.log({ status: "pass", checks });
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
