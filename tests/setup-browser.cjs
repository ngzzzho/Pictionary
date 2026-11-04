const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const b = await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  const results = [];
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const p = await c.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const click = async (a) => {
    if (a === "correct") await p.locator('[data-action="judge"]').click();
    return p.locator(`[data-action="${a}"]`).first().click();
  };
  const add = async (n) => {
    await p.locator("#player-input").fill(n);
    await p.locator("#player-input").press("Enter");
  };
  try {
    await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
    await click("setup");
    await p.locator("#player-input").fill("Draft");
    await click("next-step");
    assert.equal(await p.locator("#player-input").inputValue(), "Draft");
    assert.equal(await p.locator('[data-action="start-game"]').count(), 0);
    assert.ok(await p.locator('[role="alert"]').textContent());
    await p.locator('[data-step="3"]').click();
    assert.equal(await p.locator("#player-input").count(), 1);
    results.push(
      "zero-player continue and direct Ready navigation blocked; draft preserved",
    );
    await add("Alice");
    await click("next-step");
    assert.equal(await p.locator("#player-input").count(), 1);
    results.push("one player blocked at People");
    await add("Bob");
    await p.locator('[data-step="3"]').click();
    await click("start-game");
    await click("intro-start");
    assert.equal(await p.locator('[data-action="reveal"]').count(), 1);
    await click("reveal");
    await click("draw");
    await click("correct");
    await click("next-round");
    results.push(
      "two-player Ready -> start -> draw -> result -> next round works",
    );
    await click("exit");
    await click("setup");
    await p.locator('[data-key="mode"][data-value="teams"]').click();
    await click("next-step");
    assert.equal(await p.locator("#player-input").count(), 1);
    results.push("two players cannot silently proceed into team mode");
    await p.locator('[data-key="mode"][data-value="coop"]').click();
    await click("home");
    await click("words");
    await p.locator("#word-input").fill("Example");
    await p.locator("#word-input").press("Enter");
    await click("home");
    await click("setup");
    await p.locator('[data-step="2"]').click();
    await p.locator('details[data-disclosure="subjects"] > summary').click();
    await p.locator('[data-key="topic"][data-value="custom"]').click();
    assert.equal(await p.locator(".pool-recovery").count(), 1);
    await p.locator('[data-step="3"]').click();
    assert.equal(await p.locator('[data-action="start-game"]').count(), 0);
    assert.equal(await p.locator('.setup-step-2').count(), 1);
    assert.equal(await p.locator('.setup-panel > .error[role="alert"]').count(), 1);
    results.push("undersized custom deck shows recovery and cannot start a game");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const fresh = await b.newContext({ serviceWorkers: "block" });
    const q = await fresh.newPage();
    await q.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
    await q.locator('[data-action="quick"]').click();
    await q.locator('[data-action="intro-start"]').click();
    assert.equal(await q.locator('[data-action="reveal"]').count(), 1);
    results.push("fresh Quick start directly starts default two-player co-op");
    assert.deepEqual(errors, []);
    console.log(results);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
