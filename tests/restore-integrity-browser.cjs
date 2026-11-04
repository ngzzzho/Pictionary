// Real IndexedDB + synthetic isolated storage. No user data or licensed pixels are read.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const { build } = require("esbuild");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
(async () => {
  const bundle = await build({
    stdin: {
      contents: `import * as B from './js/backup.mjs';import {artworkArchive} from './js/artwork-store.mjs';import {defaults} from './js/profile.mjs';import * as G from './js/core.mjs';window.T={...B,artworkArchive,defaults,G};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    target: "safari15",
  });
  const browser = await (
    process.env.TEST_ENGINE === "webkit" ? webkit : chromium
  ).launch({
    headless: true,
    ...(process.env.TEST_ENGINE !== "webkit" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const results = [];
  async function isolated(name, fn) {
    const c = await browser.newContext({ serviceWorkers: "block" }),
      p = await c.newPage();
    await p.route("**/integrity-harness", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Isolated restore test</title>",
      }),
    );
    await p.goto(new URL("/integrity-harness", process.env.TEST_URL).href);
    await p.addScriptTag({ content: bundle.outputFiles[0].text });
    await p.evaluate(() => {
      window.archive = T.artworkArchive();
      window.p = {
        version: 1,
        language: "en",
        muted: false,
        players: [
          { id: "a", name: "Original", team: 0 },
          { id: "b", name: "Player 2", team: 1 },
        ],
        custom: ["本機詞"],
        settings: { ...T.defaults },
      };
      localStorage.sg_v1_profile = JSON.stringify(p);
      localStorage.pp_custom_words = '["KEEP_OLD"]';
      window.source = T.validateBackup({
        raw: {
          sg_v1_profile: JSON.stringify({
            ...p,
            language: "zh",
            custom: ["備份詞"],
          }),
        },
        inMemory: {},
        artworkArchive: [
          {
            version: 1,
            id: "game-1700000000000:1",
            ratio: 1,
            strokes: [
              {
                color: "#123abc",
                width: 7,
                points: [
                  [0.1, 0.2],
                  [0.8, 0.9],
                ],
              },
            ],
          },
        ],
      });
    });
    try {
      const detail = await fn(p);
      results.push({ name, pass: true, ...detail });
    } finally {
      await c.close();
    }
  }
  try {
    await isolated(
      "commit readback, duplicate import and recovery history",
      async (p) => {
        const r = await p.evaluate(async () => {
          const before = localStorage.sg_v1_profile,
            plan = await T.makeRestorePlan(
              source,
              localStorage,
              archive,
              "backup",
            );
          await T.applyRestore(plan, localStorage, archive);
          const after = JSON.parse(localStorage.sg_v1_profile);
          if (
            after.language !== "zh" ||
            after.custom.join() !== "本機詞,備份詞"
          )
            throw Error("merge mismatch");
          const again = await T.makeRestorePlan(source, localStorage, archive);
          if (again.counts.duplicates !== 1) throw Error("duplicate");
          await T.applyRestore(again, localStorage, archive);
          const copies = await archive.recoveries();
          if (copies.length !== 2) throw Error("history retention");
          const raw = await archive.recoveryCopy(
            copies.find((c) => c.id === "copy-" + plan.token).id,
          );
          if (raw.before.sg_v1_profile !== before) throw Error("before lost");
          if (
            localStorage.pp_custom_words !== '["KEEP_OLD"]' ||
            localStorage.getItem(T.RESTORE_MARKER)
          )
            throw Error("legacy/marker");
          return { copies: copies.length };
        });
        return r;
      },
    );
    await isolated(
      "localStorage quota failure rolls back without adding artwork",
      async (p) =>
        p.evaluate(async () => {
          const before = localStorage.sg_v1_profile,
            plan = await T.makeRestorePlan(
              source,
              localStorage,
              archive,
              "backup",
            );
          let failOnce = true;
          const s = {
            getItem: (k) => localStorage.getItem(k),
            removeItem: (k) => localStorage.removeItem(k),
            setItem: (k, v) => {
              if (k === "sg_v1_profile" && failOnce) {
                failOnce = false;
                throw new DOMException("quota", "QuotaExceededError");
              }
              localStorage.setItem(k, v);
            },
          };
          try {
            await T.applyRestore(plan, s, archive);
            throw Error("expected failure");
          } catch (e) {
            if (e.message === "expected failure") throw e;
          }
          if (
            localStorage.sg_v1_profile !== before ||
            (await archive.all()).length ||
            localStorage.getItem(T.RESTORE_MARKER) ||
            (await archive.pending())
          )
            throw Error("rollback failed");
          return { rollback: true };
        }),
    );
    await isolated(
      "interrupted journal recovers before any application write",
      async (p) => {
        const before = await p.evaluate(async () => {
          const plan = await T.makeRestorePlan(
            source,
            localStorage,
            archive,
            "backup",
          );
          window.before = localStorage.sg_v1_profile;
          localStorage.setItem(T.RESTORE_MARKER, plan.token);
          await archive.stage(plan);
          localStorage.sg_v1_profile = plan.after.sg_v1_profile;
          return before;
        });
        await p.reload();
        await p.addScriptTag({ content: bundle.outputFiles[0].text });
        const r = await p.evaluate(async () => {
          const a = T.artworkArchive();
          const result = await T.recoverRestore(localStorage, a);
          return {
            result,
            profile: localStorage.sg_v1_profile,
            count: (await a.all()).length,
          };
        });
        assert.equal(r.result.status, "rolledBack");
        assert.equal(r.profile, before);
        assert.equal(r.count, 0);
        return { reloaded: true };
      },
    );
    await isolated(
      "archive collision aborts whole transaction and preserves both stores",
      async (p) =>
        p.evaluate(async () => {
          const before = localStorage.sg_v1_profile,
            plan = await T.makeRestorePlan(
              source,
              localStorage,
              archive,
              "backup",
            );
          await archive.put(
            plan.artwork[0].id,
            [{ color: "#ffffff", width: 3, points: [[0.3, 0.4]] }],
            1,
          );
          try {
            await T.applyRestore(plan, localStorage, archive);
            throw Error("expected failure");
          } catch (e) {
            if (e.message === "expected failure") throw e;
          }
          if (
            localStorage.sg_v1_profile !== before ||
            (await archive.get(plan.artwork[0].id)).strokes[0].color !==
              "#ffffff" ||
            localStorage.getItem(T.RESTORE_MARKER)
          )
            throw Error("atomic abort");
          return { atomic: true };
        }),
    );
    await isolated(
      "failed recovery stays protected and succeeds when storage becomes writable",
      async (p) =>
        p.evaluate(async () => {
          const before = localStorage.sg_v1_profile,
            plan = await T.makeRestorePlan(
              source,
              localStorage,
              archive,
              "backup",
            );
          localStorage.setItem(T.RESTORE_MARKER, plan.token);
          await archive.stage(plan);
          localStorage.sg_v1_profile = plan.after.sg_v1_profile;
          const s = {
            getItem: (k) => localStorage.getItem(k),
            removeItem: (k) => localStorage.removeItem(k),
            setItem: () => {
              throw Error("storage unavailable");
            },
          };
          try {
            await T.recoverRestore(s, archive);
            throw Error("expected failure");
          } catch (e) {
            if (e.message === "expected failure") throw e;
          }
          if (
            !localStorage.getItem(T.RESTORE_MARKER) ||
            !(await archive.pending())
          )
            throw Error("lost recovery");
          await T.recoverRestore(localStorage, archive);
          if (localStorage.sg_v1_profile !== before)
            throw Error("retry failed");
          return { protected: true };
        }),
    );
    await isolated(
      "third-party concurrent value is never overwritten by rollback",
      async (p) =>
        p.evaluate(async () => {
          const plan = await T.makeRestorePlan(
            source,
            localStorage,
            archive,
            "backup",
          );
          localStorage.setItem(T.RESTORE_MARKER, plan.token);
          await archive.stage(plan);
          localStorage.sg_v1_profile = "CONCURRENT_OTHER_VALUE";
          try {
            await T.recoverRestore(localStorage, archive);
            throw Error("expected failure");
          } catch (e) {
            if (e.message === "expected failure") throw e;
          }
          if (
            localStorage.sg_v1_profile !== "CONCURRENT_OTHER_VALUE" ||
            !localStorage.getItem(T.RESTORE_MARKER)
          )
            throw Error("clobbered");
          return { preserved: true };
        }),
    );
    await isolated(
      "committed interruption verifies on restart; malformed local can be explicitly repaired",
      async (p) =>
        p.evaluate(async () => {
          localStorage.sg_v1_profile = "{broken";
          try {
            await T.makeRestorePlan(source, localStorage, archive);
            throw Error("expected failure");
          } catch (e) {
            if (e.message !== "restoreLocalInvalid") throw e;
          }
          const plan = await T.makeRestorePlan(
            source,
            localStorage,
            archive,
            "backup",
          );
          localStorage.setItem(T.RESTORE_MARKER, plan.token);
          await archive.stage(plan);
          for (const [k, v] of Object.entries(plan.after))
            localStorage.setItem(k, v);
          await archive.commit(plan);
          const result = await T.recoverRestore(localStorage, archive);
          if (
            result.status !== "completed" ||
            (await archive.previous()).before.sg_v1_profile !== "{broken"
          )
            throw Error("repair receipt");
          return { repaired: true };
        }),
    );
    await isolated(
      "single-scene native fallback without WebCrypto, UUID or Web Locks",
      async (p) =>
        p.evaluate(async () => {
          Object.defineProperty(crypto, "subtle", { value: undefined });
          Object.defineProperty(crypto, "randomUUID", { value: undefined });
          Object.defineProperty(navigator, "locks", { value: undefined });
          window.Capacitor = { isNativePlatform: () => true };
          const data = T.captureBackup(
              localStorage,
              { profile: p, game: null, last: null },
              source.artwork,
            ),
            files = await T.encodeBackup(data),
            decoded = await T.decodeBackup(
              files.map((f) => new File([f.text], f.name)),
            );
          const plan = await T.makeRestorePlan(decoded, localStorage, archive);
          await T.applyRestore(plan, localStorage, archive);
          if (!(await archive.get(source.artwork[0].id)))
            throw Error("native fallback failed");
          return { fallback: true };
        }),
    );
    await isolated(
      "large multipart >20 MB roundtrip imports all strokes",
      async (p) =>
        p.evaluate(async () => {
          const points = Array.from({ length: 2000 }, (_, i) => [
            Number((i / 1999).toFixed(9)),
            Number(((Math.sin(i) + 1) / 2).toFixed(9)),
          ]);
          const drawings = Array.from({ length: 100 }, (_, i) => ({
            version: 1,
            id: "large-" + i,
            ratio: 1,
            strokes: Array.from({ length: 5 }, () => ({
              color: "#123abc",
              width: 7,
              points,
            })),
          }));
          const data = T.captureBackup(
              localStorage,
              { profile: p, game: null, last: null },
              drawings,
            ),
            bytes = new TextEncoder().encode(JSON.stringify(data)).length;
          if (bytes <= 20000000) throw Error("not large");
          const files = await T.encodeBackup(data),
            decoded = await T.decodeBackup(
              files
                .slice()
                .reverse()
                .map((f) => new File([f.text], f.name)),
            );
          const plan = await T.makeRestorePlan(decoded, localStorage, archive);
          await T.applyRestore(plan, localStorage, archive);
          const all = await archive.all();
          if (
            all.length !== 100 ||
            JSON.stringify(all[99].strokes) !==
              JSON.stringify(drawings[99].strokes)
          )
            throw Error("large roundtrip");
          return { bytes, parts: files.length, drawings: all.length };
        }),
    );
  } finally {
    await browser.close();
  }
  const output = { engine: process.env.TEST_ENGINE || "chromium", results };
  fs.writeFileSync(
    process.env.RECEIPT || "../v1-checks/gallery-restore-integrity.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
