// Read metadata and computed styles only; never inspect purchased pixels.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const safari = process.env.TEST_ENGINE === "webkit";
  const b = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const records = [];
  try {
    for (const lang of ["en", "zh"])
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        const c = await b.newContext({
            viewport,
            serviceWorkers: "block",
            reducedMotion: "reduce",
          }),
          p = await c.newPage();
        const badRequests = [];
        p.on("response", (r) => {
          if (r.status() >= 400) badRequests.push(r.url());
        });
        await p.addInitScript((lang) => {
          localStorage.sg_v1_profile = JSON.stringify({
            version: 1,
            language: lang,
            muted: true,
            onboardingSeen: true,
            players: [
              { id: "a", name: "畫家", team: 0 },
              { id: "b", name: "Friend", team: 1 },
            ],
            custom: [],
            settings: {
              mode: "coop",
              surface: "canvas",
              topic: "mixed",
              difficulty: "easy",
              cardLanguage: "both",
              seconds: 120,
              roundsEach: 1,
            },
          });
        }, lang);
        await p.goto(process.env.TEST_URL || "http://127.0.0.1:8766/");
        await p.locator('[data-action="quick"]').waitFor();
        const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
        const check = async (screen) => {
          await p.evaluate(() => document.fonts.ready);
          await p.waitForFunction(() =>
            [...document.querySelectorAll(".pack-icon img")].every(
              (i) => i.complete && i.naturalWidth > 0,
            ),
          );
          const result = await p.evaluate(async () => {
            const icons = await Promise.all(
              [...document.querySelectorAll(".pack-icon")]
                .filter((e) => e.getClientRects().length)
                .map(async (e) => {
                  const mask =
                    getComputedStyle(e, "::before").webkitMaskImage ||
                    getComputedStyle(e, "::before").maskImage;
                  const url = mask.match(/url\(["']?(.*?)["']?\)/)?.[1];
                  return {
                    file: e.dataset.asset,
                    maskMatchesImage: url === e.querySelector("img").src,
                    status: url ? (await fetch(url)).status : 0,
                    w: e.offsetWidth,
                    h: e.offsetHeight,
                  };
                }),
            );
            const lum = (s) => {
              const rgb = s
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map((v) => {
                  v = Number(v) / 255;
                  return v <= 0.04045
                    ? v / 12.92
                    : ((v + 0.055) / 1.055) ** 2.4;
                });
              return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            };
            const buttons = [...document.querySelectorAll(".btn")]
              .filter((e) => !e.disabled && e.getClientRects().length)
              .map((e) => {
                const s = getComputedStyle(e),
                  face = getComputedStyle(e, "::before").backgroundColor;
                const l1 = lum(s.color),
                  l2 = lum(face),
                  r = e.getBoundingClientRect(),
                  label = e
                    .querySelector(":scope > span:not([aria-hidden])")
                    ?.getBoundingClientRect();
                return {
                  action: e.dataset.action,
                  contrast:
                    (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
                  dx:
                    label && e.matches(".has-icon")
                      ? Math.abs(label.x + label.width / 2 - r.x - r.width / 2)
                      : 0,
                  dy:
                    label && e.matches(".has-icon")
                      ? Math.abs(
                          label.y + label.height / 2 - r.y - r.height / 2,
                        )
                      : 0,
                };
              });
            const header = document.querySelector(
                ".shell > header:not(.lobby-header)",
              ),
              heading = header?.querySelector(".header-title");
            const hr = header?.getBoundingClientRect(),
              tr = heading?.getBoundingClientRect();
            const headingOffset =
              hr && tr
                ? Math.abs(tr.x + tr.width / 2 - hr.x - hr.width / 2)
                : 0;
            return {
              icons,
              buttons,
              headingOffset,
              fonts: [...document.fonts].map((f) => ({
                family: f.family,
                status: f.status,
              })),
            };
          });
          assert.ok(
            result.headingOffset < 1,
            `${screen} header title not centered`,
          );
          for (const i of result.icons) {
            assert.equal(
              i.maskMatchesImage,
              true,
              `${screen}: mask resolves relative to document, not CSS directory: ${i.file}`,
            );
            assert.equal(i.status, 200);
            assert.ok(
              i.w >= 24 && i.h >= 24,
              `${screen} icon too small ${i.file}`,
            );
          }
          for (const x of result.buttons) {
            assert.ok(
              x.contrast >= 4.5,
              `${screen} ${x.action} contrast ${x.contrast}`,
            );
            assert.ok(
              x.dx < 1 && x.dy < 1,
              `${screen} ${x.action} label not centered`,
            );
          }
          assert.ok(
            result.fonts.find(
              (f) => f.family === "Fredoka" && f.status === "loaded",
            ),
          );
          if (lang === "zh")
            assert.ok(
              result.fonts.find(
                (f) => f.family === "GenSen Rounded" && f.status === "loaded",
              ),
            );
          records.push({ lang, viewport, screen, ...result });
        };
        await check("home");
        for (const [a, s] of [
          ["setup", "players"],
          ["next-step", "style"],
          ["next-step", "topics"],
          ["next-step", "ready"],
          ["start-game", "handoff"],
          ["reveal", "reveal"],
          ["draw", "drawing"],
          ["palette", "palette"],
          ["close-palette", null],
          ["judge", "judge"],
          ["correct", "result"],
        ]) {
          await click(a);
          if (s) await check(s);
        }
        p.once("dialog", (d) => d.accept());
        await click("finish");
        await check("final");
        assert.deepEqual(badRequests, []);
        await c.close();
      }
  } finally {
    await b.close();
  }
  if (process.env.RECEIPT)
    fs.writeFileSync(
      process.env.RECEIPT,
      JSON.stringify(records, null, 2) + "\n",
    );
  console.log({
    engine: safari ? "webkit" : "chromium",
    screens: records.length,
    icons: records.reduce((n, r) => n + r.icons.length, 0),
    maskRequests: "PASS",
    fontLoad: "PASS",
    ctaContrastAndCentering: "PASS",
  });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
