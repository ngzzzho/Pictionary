// Isolated profiles and DOM-only checks. Never captures licensed pixels.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const { defaults } = await import("../js/profile.mjs"),
    { locales } = await import("../js/languages.mjs"),
    G = await import("../js/core.mjs");
  const bank = JSON.parse(fs.readFileSync("js/content.json")),
    records = [];
  const engine = process.env.TEST_ENGINE || "chromium";
  const b = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
  const base = (code = "en") => ({
    version: 1,
    language: code,
    muted: true,
    onboardingSeen: true,
    players: [
      { id: "a", name: "A", team: 0 },
      { id: "b", name: "B", team: 1 },
    ],
    custom: ["A private custom word"],
    settings: {
      ...defaults,
      mode: "coop",
      roundsEach: 3,
      cardLanguage: code === "ar" ? "ar+ja" : `${code}+ar`,
    },
  });
  async function pageFor(
    profile,
    size = { width: 390, height: 844 },
    extra = {},
  ) {
    const context = await b.newContext({
        viewport: size,
        serviceWorkers: "block",
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    await page.addInitScript(
      ({ profile, extra }) => {
        if (localStorage.getItem("seeded")) return;
        localStorage.sg_v1_profile = JSON.stringify(profile);
        localStorage.pp_custom_words = '["KEEP OLD WORD"]';
        for (const [k, v] of Object.entries(extra))
          localStorage.setItem(k, JSON.stringify(v));
        localStorage.seeded = "yes";
      },
      { profile, extra },
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    return { context, page, errors };
  }
  const click = (p, a) => p.locator(`[data-action="${a}"]`).first().click();
  const settingsOf = (p) =>
    p.evaluate(() => JSON.parse(localStorage.sg_v1_profile).settings);
  async function geometry(p) {
    await p.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    return p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      buttons: [...document.querySelectorAll(".content-picker button")]
        .filter((e) => !e.disabled)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      missing: [...document.images]
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => i.src),
    }));
  }
  try {
    for (const { code } of locales)
      for (const [width, height] of [
        [320, 568],
        [844, 390],
      ]) {
        const {
          context,
          page: p,
          errors,
        } = await pageFor(base(code), { width, height });
        await click(p, "setup");
        await p.locator('[data-action="step"][data-step="2"]').click();
        assert.equal(await p.locator('[data-value="hongkong"]').count(), 0);
        assert.equal(
          await p.locator(".subject-grid .topic").count(),
          Object.keys(bank.topics).length + 2, // Built-in subjects plus Mixed and Custom.
        );
        assert.equal(await p.locator(".playlist-grid .topic").count(), 1);
        assert.equal(await p.locator(".difficulty-options .option").count(), 3);
        assert.equal(
          await p
            .locator('[data-key="topic"][data-value="custom"]')
            .isDisabled(),
          false,
        );
        assert.equal(
          await p
            .locator(
              '[data-value="silly"], [data-value="challenge"], [data-value="expert"], [data-key="difficulty"][data-value="hard"]',
            )
            .count(),
          0,
        );
        for (const [playlist, level] of [["starter", "easy"]]) {
          await p
            .locator('details[data-disclosure="subjects"] > summary')
            .click();
          await p
            .locator(`[data-action="playlist"][data-value="${playlist}"]`)
            .click();
          const s = await settingsOf(p);
          assert.equal(s.topic, playlist);
          assert.equal(s.difficulty, level);
          assert.equal(
            await p
              .locator(`[data-action="playlist"][data-value="${playlist}"]`)
              .getAttribute("aria-pressed"),
            "true",
          );
        }
        await p.locator('[data-key="difficulty"][data-value="medium"]').click();
        assert.equal(await p.locator(".pool-recovery").count(), 1);
        assert.equal(
          await p
            .locator('[data-action="playlist"][data-value="starter"]')
            .getAttribute("aria-pressed"),
          "false",
        );
        await p
          .locator('[data-action="pool-recovery"][data-value="mixed"]')
          .click();
        assert.equal((await settingsOf(p)).topic, "mixed");
        assert.equal(await p.locator(".pool-recovery").count(), 0);
        await p
          .locator('details[data-disclosure="subjects"] > summary')
          .click();
        const geo = await geometry(p);
        assert.equal(geo.overflow, false);
        assert.deepEqual(geo.missing, []);
        assert.ok(geo.buttons.every((r) => r.w >= 44 && r.h >= 44));
        await p
          .locator('details[data-disclosure="subjects"] > summary')
          .click();
        await click(p, "next-step");
        await click(p, "start-game");
        let g = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
        assert.equal(g.settings.drawPolicy, "unique");
        assert.ok(
          g.deck.every(
            (w) =>
              w.review !== "held" &&
              !w.tags?.includes("silly") &&
              w.difficulty !== "expert",
          ),
        );
        assert.equal(
          g.deck.length,
          bank.words.filter(
            (w) => w.review === "candidate" && w.difficulty === "medium",
          ).length,
        );
        await click(p, "reveal");
        assert.equal(await p.locator(".card-line").count(), 2);
        await click(p, "draw");
        await click(p, "exit");
        await click(p, "settings");
        assert.equal(await p.locator(".active-card-pair").count(), 1);
        assert.deepEqual(errors, []);
        assert.equal(
          await p.evaluate(() => localStorage.pp_custom_words),
          '["KEEP OLD WORD"]',
        );
        records.push({
          code,
          width,
          height,
          case: "subjects-presets-capacity-start-language-note",
          pass: true,
        });
        await context.close();
      }
    // Exact-capacity custom pool must reserve all remaining cards after a reload.
    const profile = base();
    profile.custom = ["one", "two", "three", "four", "five", "six"];
    profile.settings.topic = "custom";
    let { context, page: p } = await pageFor(profile);
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="3"]').click();
    await click(p, "start-game");
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      await click(p, "reveal");
      const word = await p.evaluate(
        () => JSON.parse(localStorage.sg_v1_game).word.id,
      );
      assert.ok(!seen.has(word));
      seen.add(word);
      assert.equal(await p.locator('[data-action="swap"]').isDisabled(), true);
      assert.equal(await p.locator(".swap-reserved").count(), 1);
      if (i === 0) {
        await p.reload();
        await click(p, "resume-game");
        await click(p, "uncover");
      }
      await click(p, "draw");
      await click(p, "give-up");
      await click(p, "next-round");
    }
    assert.equal(await p.locator('[data-action="replay"]').count(), 1);
    await click(p, "replay");
    assert.equal(await p.locator('[data-action="reveal"]').count(), 1);
    await click(p, "exit");
    await click(p, "words");
    await p.locator("#word-input").fill("seventh custom card");
    await p.locator("#word-input").press("Enter");
    await click(p, "home");
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="2"]').click();
    await p.locator('details[data-disclosure="subjects"] > summary').click();
    assert.match(
      await p
        .locator('[data-key="topic"][data-value="custom"] small')
        .innerText(),
      /^7 /,
    );
    records.push({
      case: "six-card-six-turn-unique-reload-replay-and-custom-cache-invalidation",
      pass: true,
    });
    await context.close();
    // Retired topic is mapped for new selection without overwriting preferences.
    const oldProfile = base();
    oldProfile.settings.topic = "hongkong";
    ({ context, page: p } = await pageFor(oldProfile));
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="2"]').click();
    assert.equal(await p.locator(".legacy-theme").count(), 1);
    assert.equal((await settingsOf(p)).topic, "hongkong");
    await context.close();
    // Short legacy replay cannot overwrite an independently active game or setup.
    const oldSettings = { ...defaults, mode: "coop", roundsEach: 3 };
    const old = G.newGame(
      oldProfile.players,
      oldSettings,
      bank.words.filter((w) => w.review === "candidate").slice(0, 5),
      1000,
    );
    G.finish(old, 1001);
    const active = G.newGame(
      oldProfile.players,
      { ...oldSettings, drawPolicy: "unique" },
      bank.words.filter((w) => w.review === "candidate").slice(0, 8),
      2000,
    );
    ({ context, page: p } = await pageFor(
      oldProfile,
      { width: 390, height: 844 },
      { sg_v1_last: old, sg_v1_game: active },
    ));
    await click(p, "last");
    await click(p, "replay");
    assert.ok(await p.locator(".setup-step-2").count());
    const saved = await p.evaluate(() => ({
      p: JSON.parse(localStorage.sg_v1_profile),
      g: JSON.parse(localStorage.sg_v1_game),
    }));
    assert.deepEqual(saved.p, oldProfile);
    assert.equal(saved.g.id, active.id);
    records.push({
      case: "legacy-alias-and-short-replay-preserve-data",
      pass: true,
    });
    await context.close();
    // Parked preferences are normalized for the next game, never on read.
    for (const topic of ["silly", "challenge", "mixed"]) {
      const pr = base(
        topic === "silly" ? "zh" : topic === "challenge" ? "ar" : "en",
      );
      pr.settings = { ...pr.settings, topic, difficulty: "expert" };
      ({ context, page: p } = await pageFor(pr));
      await click(p, "setup");
      await p.locator('[data-action="step"][data-step="2"]').click();
      assert.equal(await p.locator(".legacy-theme").count(), 1);
      assert.equal(
        await p
          .locator('[data-key="difficulty"][data-value="general"]')
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await p
          .locator('[data-key="topic"][data-value="mixed"]')
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.deepEqual(await settingsOf(p), pr.settings);
      await click(p, "next-step");
      await click(p, "start-game");
      const fresh = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
      assert.equal(fresh.settings.topic, "mixed");
      assert.equal(fresh.settings.difficulty, "general");
      assert.equal(
        fresh.deck.length,
        bank.words.filter((w) => w.review === "candidate").length + 1,
      );
      assert.ok(
        fresh.deck.every(
          (w) => w.id.startsWith("custom:") || w.review === "candidate",
        ),
      );
      records.push({ case: `parked-${topic}-profile-future-only`, pass: true });
      await context.close();
    }
    // Quick Play still opens a familiar Easy-start pool.
    ({ context, page: p } = await pageFor(base()));
    await click(p, "quick");
    const quick = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
    assert.equal(quick.deck.length, bank.collections.starter.wordIds.length);
    assert.deepEqual(
      quick.deck.map((w) => w.id).sort(),
      [...bank.collections.starter.wordIds].sort(),
    );
    assert.ok(
      quick.deck.every(
        (w) => w.starter && w.review === "candidate" && w.difficulty === "easy",
      ),
    );
    records.push({ case: "quick-mainstream-starter", pass: true });
    await context.close();
    // Exact old challenge deck/word survives Resume and reload. Replaying it
    // redirects without replacing either the last game or an active game.
    const archived = bank.words.filter((w) => w.difficulty === "expert");
    const savedChallenge = G.newGame(
      base().players,
      {
        ...defaults,
        mode: "coop",
        roundsEach: 3,
        topic: "challenge",
        difficulty: "expert",
        cardLanguage: "zh+ja",
        drawPolicy: "unique",
      },
      archived,
      1000,
    );
    G.reveal(savedChallenge);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_game: savedChallenge },
    ));
    await click(p, "resume-game");
    await click(p, "uncover");
    assert.equal(await p.locator(".card-line").count(), 2);
    await p.reload();
    await click(p, "resume-game");
    await click(p, "uncover");
    const resumed = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
    assert.deepEqual(resumed.deck, savedChallenge.deck);
    assert.deepEqual(resumed.word, savedChallenge.word);
    assert.deepEqual(resumed.settings, savedChallenge.settings);
    records.push({
      case: "archived-challenge-resume-exact-deck-word-languages",
      pass: true,
    });
    await context.close();
    const completed = G.clone(savedChallenge);
    G.finish(completed, 2000);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_last: completed, sg_v1_game: active },
    ));
    await click(p, "last");
    await click(p, "replay");
    assert.equal(await p.locator(".setup-step-2").count(), 1);
    const afterRedirect = await p.evaluate(() => ({
      p: JSON.parse(localStorage.sg_v1_profile),
      g: JSON.parse(localStorage.sg_v1_game),
      last: JSON.parse(localStorage.sg_v1_last),
    }));
    assert.deepEqual(afterRedirect.p, base());
    assert.equal(afterRedirect.g.id, active.id);
    assert.deepEqual(afterRedirect.last, completed);
    records.push({
      case: "archived-challenge-replay-redirect-preserves-stores",
      pass: true,
    });
    await context.close();
    // Ordinary Mixed replay filters historical parked cards, including custom
    // words unchanged, before creating the new game.
    const ordinaryWords = bank.words
      .filter((w) => w.review === "candidate")
      .slice(0, 8);
    const replayOld = G.newGame(
      base().players,
      { ...defaults, mode: "coop", roundsEach: 3, difficulty: "general" },
      [
        ...ordinaryWords,
        ...archived.slice(0, 3),
        { id: "custom:keep this", en: "KEEP THIS", zh: "" },
      ],
      1000,
    );
    G.finish(replayOld, 2000);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_last: replayOld },
    ));
    await click(p, "last");
    await click(p, "replay");
    const replayNew = await p.evaluate(() =>
      JSON.parse(localStorage.sg_v1_game),
    );
    assert.equal(replayNew.deck.length, 9);
    assert.ok(
      replayNew.deck.every(
        (w) => w.id.startsWith("custom:") || w.review === "candidate",
      ),
    );
    assert.equal(
      replayNew.deck.find((w) => w.id.startsWith("custom:")).en,
      "KEEP THIS",
    );
    assert.deepEqual(
      await p.evaluate(() => JSON.parse(localStorage.sg_v1_last)),
      replayOld,
    );
    records.push({
      case: "mixed-replay-filters-parked-keeps-custom-and-old-result",
      pass: true,
    });
    await context.close();
    // Regraded cards stay in old saved games, but a new Easy replay must not
    // bring former-Easy / now-Medium cards back into that difficulty.
    const easyEight = bank.words
      .filter((w) => w.review === "candidate" && w.difficulty === "easy")
      .slice(0, 8);
    const promoted = bank.words.find((w) => w.id === "n:raccoon");
    assert.equal(promoted.difficulty, "medium");
    const beforeRegrade = { ...promoted, difficulty: "easy", starter: true };
    const oldEasy = G.newGame(
      base().players,
      { ...defaults, mode: "coop", roundsEach: 3, difficulty: "easy" },
      [...easyEight, beforeRegrade],
      1000,
    );
    G.finish(oldEasy, 2000);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_last: oldEasy },
    ));
    await click(p, "last");
    await click(p, "replay");
    const easyReplay = await p.evaluate(() =>
      JSON.parse(localStorage.sg_v1_game),
    );
    assert.equal(easyReplay.deck.length, 8);
    assert.ok(
      easyReplay.deck.every(
        (w) => w.difficulty === "easy" && w.id !== beforeRegrade.id,
      ),
    );
    assert.deepEqual(
      await p.evaluate(() => JSON.parse(localStorage.sg_v1_last)),
      oldEasy,
    );
    records.push({
      case: "replay-applies-recalibrated-level-keeps-old-result",
      pass: true,
    });
    await context.close();
    // Standard supports the largest individual game with room to swap.
    const large = base();
    large.players = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      name: `P${i + 1}`,
      team: i % 2,
    }));
    large.settings = {
      ...large.settings,
      mode: "individual",
      roundsEach: 3,
      difficulty: "medium",
    };
    ({ context, page: p } = await pageFor(large));
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="2"]').click();
    assert.equal(await p.locator(".pool-recovery").count(), 0);
    assert.equal(
      await p.locator('[data-key="difficulty"][data-value="hard"]').count(),
      0,
    );
    await click(p, "next-step");
    await click(p, "start-game");
    const full = await p.evaluate(() => JSON.parse(localStorage.sg_v1_game));
    assert.equal(full.schedule.length, 36);
    assert.equal(
      full.deck.length,
      bank.words.filter(
        (w) => w.review === "candidate" && w.difficulty === "medium",
      ).length,
    );
    assert.equal(new Set(full.deck.map((w) => w.id)).size, full.deck.length);
    await click(p, "reveal");
    assert.equal(await p.locator('[data-action="swap"]').isDisabled(), false);
    const firstWord =
      full.word?.id ||
      (await p.evaluate(() => JSON.parse(localStorage.sg_v1_game).word.id));
    await click(p, "swap");
    assert.notEqual(
      await p.evaluate(() => JSON.parse(localStorage.sg_v1_game).word.id),
      firstWord,
    );
    records.push({ case: "36-turn-standard-capacity-and-swap", pass: true });
    await context.close();
    // Narrow subjects must still disclose an insufficient pool.
    const smallTopic = "occupations";
    const smallCount = bank.words.filter(
      (w) =>
        w.review === "candidate" &&
        w.topic === smallTopic &&
        w.difficulty === "easy",
    ).length;
    assert.ok(
      smallCount > 0 && smallCount < 36,
      "Jobs Easy must exercise the 36-turn capacity guard",
    );
    const small = structuredClone(large);
    small.settings.topic = smallTopic;
    small.settings.difficulty = "easy";
    ({ context, page: p } = await pageFor(small));
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="2"]').click();
    assert.equal(await p.locator(".pool-recovery").count(), 1);
    assert.equal(
      await p
        .locator(`[data-key="topic"][data-value="${smallTopic}"]`)
        .isDisabled(),
      false,
    );
    await click(p, "next-step");
    assert.equal(await p.locator('[data-action="start-game"]').count(), 0);
    assert.equal(
      await p
        .locator('[data-action="step"][data-step="2"]')
        .getAttribute("aria-current"),
      "step",
    );
    assert.equal(await p.locator('.setup-panel [role="alert"]').count(), 1);
    await p
      .locator('[data-action="pool-recovery"][data-value="mixed"]')
      .click();
    assert.equal(await p.locator(".pool-recovery").count(), 0);
    await click(p, "next-step");
    assert.equal(
      await p.locator('[data-action="start-game"]').isEnabled(),
      true,
    );
    records.push({
      case: "small-easy-subject-selectable-capacity-guard",
      pass: true,
    });
    await context.close();
    // Old Hard preference is normalized only for future play, never on read.
    const hardProfile = base();
    hardProfile.settings.difficulty = "hard";
    ({ context, page: p } = await pageFor(hardProfile));
    await click(p, "setup");
    await p.locator('[data-action="step"][data-step="2"]').click();
    assert.equal(await p.locator(".legacy-theme").count(), 1);
    assert.equal(
      await p
        .locator('[data-key="difficulty"][data-value="medium"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(await settingsOf(p), hardProfile.settings);
    await p.reload();
    await click(p, "setup");
    assert.deepEqual(await settingsOf(p), hardProfile.settings);
    await p.locator('[data-action="step"][data-step="2"]').click();
    await p.locator('[data-key="difficulty"][data-value="medium"]').click();
    assert.equal((await settingsOf(p)).difficulty, "medium");
    records.push({
      case: "old-hard-preference-future-standard-preserves-storage",
      pass: true,
    });
    await context.close();
    // An exact historical Hard game remains resumable, while Replay redirects.
    const formerHard = bank.words
      .filter((w) => w.review === "candidate")
      .slice(0, 8)
      .map((w) => ({ ...w, difficulty: "hard" }));
    const oldHard = G.newGame(
      base().players,
      {
        ...defaults,
        mode: "coop",
        roundsEach: 3,
        difficulty: "hard",
        drawPolicy: "unique",
      },
      formerHard,
      3000,
    );
    G.reveal(oldHard);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_game: oldHard },
    ));
    await click(p, "resume-game");
    await click(p, "uncover");
    await p.reload();
    await click(p, "resume-game");
    await click(p, "uncover");
    const hardResumed = await p.evaluate(() =>
      JSON.parse(localStorage.sg_v1_game),
    );
    assert.deepEqual(hardResumed.deck, oldHard.deck);
    assert.deepEqual(hardResumed.word, oldHard.word);
    assert.deepEqual(hardResumed.settings, oldHard.settings);
    records.push({
      case: "old-hard-resume-keeps-exact-deck-word-settings",
      pass: true,
    });
    await context.close();
    const hardCompleted = G.clone(oldHard);
    G.finish(hardCompleted, 4000);
    ({ context, page: p } = await pageFor(
      base(),
      { width: 390, height: 844 },
      { sg_v1_last: hardCompleted, sg_v1_game: active },
    ));
    await click(p, "last");
    await click(p, "replay");
    assert.equal(await p.locator(".setup-step-2").count(), 1);
    assert.equal(
      await p.locator('.setup-panel .error[role="alert"]').count(),
      1,
    );
    const hardRedirect = await p.evaluate(() => ({
      profile: JSON.parse(localStorage.sg_v1_profile),
      game: JSON.parse(localStorage.sg_v1_game),
      last: JSON.parse(localStorage.sg_v1_last),
    }));
    assert.deepEqual(hardRedirect.profile, base());
    assert.deepEqual(hardRedirect.game, active);
    assert.deepEqual(hardRedirect.last, hardCompleted);
    records.push({
      case: "old-hard-replay-redirect-preserves-last-active-profile",
      pass: true,
    });
    await context.close();
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.RECEIPT || "../v1-checks/content-v2/browser.json",
      JSON.stringify({ engine, records }, null, 2) + "\n",
    );
  }
  console.log({ engine, checks: records.length });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
