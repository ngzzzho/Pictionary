import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  locales,
  validLocale,
  detectLocale,
  cardLanguages,
  encodeCardLanguages,
  validCardLanguages,
} from "../js/languages.mjs";
import { catalogs, cardLines } from "../js/localization.mjs";
import { validateLocales } from "../scripts/validate-locales.mjs";
import { defaults, validProfile } from "../js/profile.mjs";
import * as G from "../js/core.mjs";
import { captureBackup, encodeBackup, decodeBackup } from "../js/backup.mjs";
import { publicTVFrame, validTVFrame, createTVTransport } from "../js/tv.mjs";
const content = JSON.parse(
  await fs.readFile(new URL("../js/content.json", import.meta.url)),
);
const polish = JSON.parse(await fs.readFile("scripts/content-language-review.json"));
const active = content.words.filter((w) => w.review !== "held");
const players = [
  { id: "p1", name: "原有名字 — عائشة", team: 0 },
  { id: "p2", name: "বন্ধু — Friend", team: 1 },
];
const profile = {
  version: 1,
  language: "zh",
  muted: true,
  players,
  custom: ["保留原文", "میرا لفظ"],
  settings: { ...defaults, mode: "coop" },
};
const choices = locales.flatMap((a) => [
  [a.code],
  ...locales.filter((b) => b.code !== a.code).map((b) => [a.code, b.code]),
]);
test("ten language families, complete catalogs and active word concepts", async () => {
  assert.equal(new Set(locales.map((x) => x.family)).size, 10);
  assert.equal(locales.length, 18);
  await validateLocales();
  const additions = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-topic-additions.json", import.meta.url),
    ),
  );
  const baseline = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-topic-baseline.json", import.meta.url),
    ),
  );
  const depthAdditions = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-depth-additions.json", import.meta.url),
    ),
  );
  const depthBaseline = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-depth-baseline.json", import.meta.url),
    ),
  );
  assert.equal(
    depthBaseline.words.filter((w) => w.review !== "held").length,
    685,
  );
  const historicalActive = baseline.words.filter((w) => w.review !== "held");
  assert.equal(historicalActive.length, 612);
  assert.deepEqual(
    active.map((w) => w.id).sort(),
    [...historicalActive, ...additions, ...depthAdditions]
      .filter(w => !Object.hasOwn(polish.held,w.id))
      .map((w) => w.id)
      .sort(),
  );
  assert.equal(active.length, 609 + additions.length + depthAdditions.length);
  assert.equal(detectLocale(["xx", "ar-EG"]), "ar");
  assert.equal(detectLocale(["zh-HK"]), "zh");
  assert.equal(detectLocale(["zh-CN"]), "zh-Hans");
  assert.equal(detectLocale(["pt-PT"]), "pt-PT");
});
test("all 324 single/ordered card pairs render every active concept without English fallback", () => {
  assert.equal(choices.length, 324);
  for (const pair of choices) {
    const selection = encodeCardLanguages(pair);
    assert.ok(validCardLanguages(selection));
    assert.deepEqual(cardLanguages(selection), pair);
    for (const word of active) {
      const before = JSON.stringify(word),
        lines = cardLines(word, selection);
      assert.deepEqual(
        lines.map((x) => x.code),
        pair,
      );
      assert.deepEqual(
        lines.map((x) => x.text),
        pair.map((c) => polish.entries[word.id]?.labels[c] || catalogs[c].words[word.id]),
      );
      assert.ok(lines.every((x) => !x.original));
      assert.equal(JSON.stringify(word), before);
    }
  }
  for (const value of [
    null,
    {},
    [],
    ["ar", "fr"],
    "ar+ar",
    "en+zh+ar",
    "both+en",
    "fr+xx",
    "",
    "AR",
    "constructor",
    "__proto__",
  ])
    assert.equal(validCardLanguages(value), false);
  assert.equal(validLocale("en+ar"), false);
});
test("old English/Chinese saves and new selections validate without rewriting word snapshots or score rules", () => {
  for (const selection of [
    "en",
    "zh",
    "both",
    ...choices.map(encodeCardLanguages),
  ]) {
    const p = {
      ...profile,
      settings: { ...profile.settings, cardLanguage: selection },
    };
    const game = G.newGame(players, p.settings, active.slice(0, 8), 1000);
    const before = JSON.stringify(game);
    assert.ok(validProfile(p));
    assert.ok(G.validGame(game));
    assert.equal(JSON.stringify(game), before);
    G.reveal(game);
    G.start(game, 1000);
    G.end(game, "correct", "p2", 1500);
    assert.equal(game.successes, 1);
    assert.deepEqual(
      game.players.map((x) => x.score),
      [0, 0],
    );
    G.undo(game);
    assert.equal(game.successes, 0);
  }
  const custom = { id: "custom:原有字詞", en: "原有字詞", zh: "" };
  assert.deepEqual(cardLines(custom, "fr+ar"), [
    { code: "", text: "原有字詞", original: true },
  ]);
  const changed = { ...active[0], en: "Old custom meaning" };
  assert.ok(cardLines(changed, "ar+fr").every((x) => x.original));
  assert.deepEqual(
    cardLines(active[0], "both").map((x) => x.text),
    [active[0].en, active[0].zh],
  );
});
test("multilingual backup round-trip preserves legacy raw bytes, mixed names, custom words and drawing", async () => {
  const raw = new Map([
    ["pp_custom_words", '["舊字詞"]'],
    ["pp_game", "legacy bytes"],
  ]);
  for (const { code } of locales) {
    const p = {
      ...profile,
      language: code,
      settings: {
        ...profile.settings,
        cardLanguage: encodeCardLanguages([code, code === "en" ? "ar" : "en"]),
      },
    };
    const game = G.newGame(players, p.settings, active.slice(0, 8), 1000);
    game.strokes = [
      {
        color: "#123456",
        width: 7,
        points: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      },
    ];
    const data = captureBackup(
      { getItem: (k) => raw.get(k) ?? null },
      { profile: p, game, last: null },
      [],
    );
    const files = await encodeBackup(data, 2048);
    const decoded = await decodeBackup(
      files.map((p) => ({
        size: Buffer.byteLength(p.text),
        text: async () => p.text,
      })),
    );
    assert.deepEqual(decoded.current.profile, p);
    assert.deepEqual(decoded.current.game.strokes, game.strokes);
    assert.equal(data.raw.pp_custom_words, '["舊字詞"]');
  }
});
test("TV receives allowlisted locale only; localization does not carry words or unlock private state", async () => {
  const sent = [];
  const guarded = {
    available: true,
    enabled: true,
    connected: false,
    privateAllowed: false,
    resetRequired: true,
    epoch: 3,
    reason: "waiting",
  };
  const tv = createTVTransport({
    bridge: {
      postMessage: (m) => {
        sent.push(m);
        return guarded;
      },
    },
    target: new EventTarget(),
  });
  await tv.start();
  for (const { code } of locales) {
    await tv.locale(code);
    assert.deepEqual(sent.at(-1), { action: "locale", language: code });
    assert.equal(tv.status.privateAllowed, false);
    const f = publicTVFrame({
      game: {
        word: { en: "SECRET" },
        settings: { mode: "coop", surface: "canvas" },
        phase: "drawing",
        strokes: [],
        successes: 0,
      },
      visible: true,
      epoch: 3,
      seq: 1,
      language: code,
    });
    assert.ok(validTVFrame(f));
    assert.equal(f.language, code);
    assert.ok(!JSON.stringify(f).includes("SECRET"));
  }
  const n = sent.length;
  await tv.locale("SECRET");
  assert.equal(sent.length, n);
  tv.stop();
});
