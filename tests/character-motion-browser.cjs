// Character, privacy, and motion lifecycle regression. No screenshots or pixel reads.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/character-assets.json"), "utf8"),
);
const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
const checks = [];
const profile = {
  version: 1,
  language: "en",
  muted: true,
  onboardingSeen: true,
  players: [1, 2, 3].map((i) => ({
    id: String(i),
    name: `Player ${i}`,
    team: i % 2,
  })),
  custom: [],
  settings: {
    mode: "individual",
    surface: "canvas",
    topic: "mixed",
    difficulty: "easy",
    cardLanguage: "both",
    seconds: 60,
    roundsEach: 1,
  },
};

async function seed(page) {
  await page.addInitScript((p) => {
    localStorage.sg_v1_profile = JSON.stringify(p);
  }, profile);
}
const click = (page, action) =>
  page.locator(`[data-action="${action}"]`).first().click();
async function drawStroke(page) {
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box, "drawing canvas is present");
  await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.55);
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.42);
  await page.mouse.up();
}
async function waitForCharacter(page, pose) {
  await page.waitForFunction((pose) => {
    const image = document.querySelector(`.mascot-${pose} img`);
    return image?.complete && image.naturalWidth > 0;
  }, pose);
}
async function enterDrawing(page) {
  await click(page, "reveal");
  await click(page, "draw");
}
async function startConfiguredGame(page) {
  await click(page, "setup");
  await page.locator('[data-action="step"][data-step="3"]').click();
  await page.locator('[data-action="start-game"]').click();
}
async function finishCurrent(page) {
  page.once("dialog", (dialog) => dialog.accept());
  await click(page, "finish");
  await page.locator(".celebration").waitFor();
}
async function animationState(page, selector) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el);
      return {
        name: s.animationName,
        duration: s.animationDuration,
        iterations: s.animationIterationCount,
      };
    }),
  );
}
async function settleAnimations(page) {
  await page.waitForTimeout(1050);
  const running = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .map((el) => ({
        name: getComputedStyle(el).animationName,
        play: el.getAnimations().some((a) => a.playState === "running"),
      }))
      .filter((x) => x.name !== "none" && x.play),
  );
  assert.deepEqual(
    running,
    [],
    "CSS animations finish within one second on a stable view",
  );
}

(async () => {
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
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await seed(page);
    await page.goto(url);
    await page.locator(".mascot-welcome img").waitFor({ state: "visible" });
    await waitForCharacter(page, "welcome");
    await settleAnimations(page);
    await click(page, "setup");
    assert.equal(
      await page
        .locator('.choice[data-value="teams"] .pack-icon')
        .getAttribute("data-asset"),
      "assets/layerlab/picto-friends.png",
    );
    await click(page, "home");
    await startConfiguredGame(page);
    await page.locator(".handoff-stage").waitFor();
    await waitForCharacter(page, "secret");
    assert.match(await page.locator(".handoff-stage").innerText(), /Player 1/);
    await enterDrawing(page);
    assert.equal(
      await page.locator(".mascot").count(),
      0,
      "drawing phase has no mascot",
    );
    for (const [action, caption] of [
      ["undo-stroke", "undoShort"],
      ["redo-stroke", "redoShort"],
      ["clear-canvas", "clearShort"],
    ]) {
      const btn = page.locator(`[data-action="${action}"]`);
      assert.ok(await btn.getAttribute("aria-label"));
      assert.ok(await btn.getAttribute("title"));
      assert.equal(
        await btn.locator(".tool-caption").count(),
        1,
        `${caption} caption exists`,
      );
    }
    await drawStroke(page);
    await page.locator('[data-action="undo-stroke"]').click();
    await page.locator('[data-action="redo-stroke"]').click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-action="clear-canvas"]').click();
    await page
      .locator("#peek")
      .dispatchEvent("pointerdown", { pointerType: "touch" });
    const peekText = await page.locator("#peek span").innerText();
    assert.notEqual(peekText, "Hold to peek");
    assert.equal(
      await page.locator("#peek.is-peeking .pack-icon").count(),
      1,
      "peek retains its icon while showing the secret",
    );
    await page
      .locator("#peek")
      .dispatchEvent("pointerup", { pointerType: "touch" });
    assert.equal(await page.locator("#peek span").innerText(), "Hold to peek");
    await page.evaluate(() => window.dispatchEvent(new Event("native-pause")));
    assert.equal(await page.locator(".privacy-cover").count(), 1);
    assert.equal(
      await page.locator('.privacy-cover [data-action="uncover"]').count(),
      1,
    );
    assert.ok(
      !(await page.locator(".privacy-cover").innerText()).includes(peekText),
      "privacy cover does not expose the word",
    );
    await click(page, "uncover");
    await click(page, "judge");
    await page.locator('[data-action="correct"][data-id="2"]').click();
    await page.locator(".result-stage").waitFor();
    assert.ok(
      (await page.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
    );
    await waitForCharacter(page, "celebrate");
    const motion = await animationState(
      page,
      ".mascot, .celebration-burst i, .result-stage, .score-gain",
    );
    assert.ok(motion.some((x) => x.name === "character-cheer"));
    assert.ok(
      motion.every(
        (x) => x.iterations !== "infinite" && parseFloat(x.duration) <= 0.8,
      ),
      JSON.stringify(motion),
    );
    await settleAnimations(page);
    checks.push(
      "welcome and handoff characters load; drawing omits mascot; tools, peek, privacy cover, and correct-result celebration behave structurally",
    );

    await page.locator('[data-action="sound"]').click();
    assert.equal(
      (await page.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
      false,
      "sound rerender does not replay result celebration",
    );
    await click(page, "exit");
    await click(page, "resume-game");
    assert.equal(
      (await page.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
      false,
      "resuming a result does not replay celebration",
    );
    await finishCurrent(page);
    assert.equal(
      (await page.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
      true,
      "live final with a correct result celebrates",
    );
    await click(page, "home");
    await click(page, "last");
    assert.equal(
      (await page.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
      false,
      "viewing Last game does not celebrate",
    );
    checks.push(
      "result celebration does not replay on sound, resume, or Last game; live successful final celebrates",
    );

    // A separate zero-success game verifies that final celebration is conditional.
    const zero = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      reducedMotion: "no-preference",
    });
    const z = await zero.newPage();
    await seed(z);
    await z.goto(url);
    await startConfiguredGame(z);
    await enterDrawing(z);
    await click(z, "give-up");
    await finishCurrent(z);
    assert.equal(
      (await z.locator(".shell").getAttribute("class")).includes(
        "celebrate-enter",
      ),
      false,
      "live final with zero successes does not celebrate",
    );
    checks.push("zero-success final has no celebration");

    // Dialog entry is emitted once; brush/colour rerenders keep the same dialog id but do not replay it.
    const toolsContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      reducedMotion: "no-preference",
    });
    const t = await toolsContext.newPage();
    await seed(t);
    await t.goto(url);
    await startConfiguredGame(t);
    await enterDrawing(t);
    await click(t, "palette");
    const firstDialogAnim = await t
      .locator("#palette-dialog")
      .evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(firstDialogAnim, "sheet-arrive");
    const dialogDurations = await animationState(t, "#palette-dialog");
    assert.ok(
      dialogDurations.every(
        (x) =>
          x.name === "sheet-arrive" &&
          x.iterations !== "infinite" &&
          parseFloat(x.duration) <= 0.8,
      ),
    );
    await t.locator('[data-action="colour"][data-value="#4589e3"]').click();
    assert.equal(
      await t
        .locator("#palette-dialog")
        .getAttribute("class")
        .then((x) => x.includes("dialog-enter")),
      false,
      "colour rerender does not re-enter dialog",
    );
    await t.locator('[data-action="brush"][data-value="14"]').click();
    assert.equal(
      await t
        .locator("#palette-dialog")
        .getAttribute("class")
        .then((x) => x.includes("dialog-enter")),
      false,
      "brush rerender does not re-enter dialog",
    );
    await click(t, "close-palette");
    await settleAnimations(t);
    checks.push(
      "palette dialog animates once; colour and brush updates do not replay; normal motion finishes under one second",
    );

    // Reduced motion is checked on representative mascot, celebration, particle, and dialog nodes.
    const reduced = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const r = await reduced.newPage();
    await seed(r);
    await r.goto(url);
    await startConfiguredGame(r);
    await enterDrawing(r);
    await click(r, "judge");
    await r.locator('[data-action="correct"][data-id="2"]').click();
    const reducedState = await animationState(
      r,
      ".mascot, .celebration-burst i, .result-stage, .score-gain, .dialog-enter",
    );
    assert.ok(reducedState.length > 0);
    assert.ok(
      reducedState.every((x) => x.name === "none"),
      JSON.stringify(reducedState),
    );
    await click(r, "undo");
    await click(r, "palette");
    assert.equal(
      await r
        .locator("#palette-dialog")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    const allAnimations = await r.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((el) => getComputedStyle(el).animationName)
        .filter((n) => n !== "none"),
    );
    assert.deepEqual(
      allAnimations,
      [],
      "reduced motion disables all CSS animations",
    );
    checks.push(
      "reduced motion disables animation on characters, result/particles, dialog, and all rendered elements",
    );

    // Manifest verification hashes response bytes only; no image decoding or pixel inspection.
    for (const asset of manifest) {
      const response = await context.request.get(new URL(asset.file, url).href);
      const bytes = await response.body();
      const result = {
        status: response.status(),
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
      assert.equal(result.status, 200, `${asset.file} HTTP 200`);
      assert.equal(result.bytes, asset.bytes, `${asset.file} byte size`);
      assert.equal(result.sha256, asset.sha256, `${asset.file} SHA-256`);
    }
    checks.push(
      `all ${manifest.length} character asset responses match manifest byte counts and SHA-256`,
    );
    assert.deepEqual(pageErrors, []);
    console.log({
      status: "pass",
      url,
      checks,
      characterAssets: manifest.length,
      pageErrors,
    });
    await Promise.all([
      context.close(),
      zero.close(),
      toolsContext.close(),
      reduced.close(),
    ]);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
