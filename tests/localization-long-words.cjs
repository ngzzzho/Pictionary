const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const G = await import("../js/core.mjs"),
    { locales, encodeCardLanguages } = await import("../js/languages.mjs"),
    { catalogs } = await import("../js/localization.mjs"),
    { defaults } = await import("../js/profile.mjs");
  const content = JSON.parse(fs.readFileSync("js/content.json"));
  const words = content.words.filter((w) => w.review !== "held");
  const engine = process.env.TEST_ENGINE || "chromium";
  const b = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const records = [],
    failures = [];
  try {
    for (const { code } of locales) {
      const second = code === "ar" ? "de" : "ar";
      const pair = encodeCardLanguages([code, second]);
      const worst = words
        .slice()
        .sort(
          (a, b) =>
            catalogs[code].words[b.id].length +
            catalogs[second].words[b.id].length -
            (catalogs[code].words[a.id].length +
              catalogs[second].words[a.id].length),
        )
        .slice(0, 3);
      for (const [width, height] of [
        [320, 568],
        [844, 390],
      ])
        for (const word of worst) {
          const c = await b.newContext({
              viewport: { width, height },
              serviceWorkers: "block",
              reducedMotion: "reduce",
            }),
            p = await c.newPage();
          const profile = {
            version: 1,
            language: code,
            muted: true,
            onboardingSeen: true,
            players: [
              { id: "a", name: "Painter", team: 0 },
              { id: "b", name: "Friend", team: 1 },
            ],
            custom: [],
            settings: { ...defaults, mode: "coop", cardLanguage: pair },
          };
          const game = G.newGame(
            profile.players,
            profile.settings,
            words,
            1000,
          );
          G.reveal(game);
          game.word = word;
          assert.ok(G.validGame(game));
          await p.addInitScript(
            ({ profile, game }) => {
              localStorage.sg_v1_profile = JSON.stringify(profile);
              localStorage.sg_v1_game = JSON.stringify(game);
            },
            { profile, game },
          );
          await p.goto(process.env.TEST_URL);
          await p.locator('[data-action="resume-game"]').click();
          if (await p.locator('[data-action="uncover"]').count())
            await p.locator('[data-action="uncover"]').click();
          await p.evaluate(() => document.fonts.ready);
          await p.evaluate(() => scrollTo(0, 0));
          const r = await p.evaluate(() => {
            const e = document.querySelector('[data-action="draw"]'),
              r = e.getBoundingClientRect();
            const card = document.querySelector(".word-card");
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              ctaVisible: r.bottom <= innerHeight && r.top >= 0,
              ctaBottom: r.bottom,
              cardHeight: card.getBoundingClientRect().height,
              lines: [...card.querySelectorAll("bdi")].map((x) => ({
                size: parseFloat(getComputedStyle(x).fontSize),
                text: x.textContent,
              })),
            };
          });
          const row = { code, second, width, height, word: word.id, ...r };
          records.push(row);
          if (r.overflow || !r.ctaVisible || r.lines.some((x) => x.size < 22))
            failures.push(row);
          await c.close();
        }
    }
  } finally {
    await b.close();
    fs.writeFileSync(
      process.env.RECEIPT || "../v1-checks/localization/long-words.json",
      JSON.stringify({ engine, records, failures }, null, 2) + "\n",
    );
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10)));
  console.log(JSON.stringify({ cases: records.length, failures: 0 }));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
