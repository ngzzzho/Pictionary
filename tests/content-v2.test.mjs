import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as G from "../js/core.mjs";
import {
  makeDeck,
  resolveTopic,
  topicChoices,
  difficultyKeys,
  resolveDifficulty,
  isPausedSelection,
  eligibleReplayDeck,
} from "../js/decks.mjs";
import { catalogs, cardLines } from "../js/localization.mjs";
import { defaults, validProfile } from "../js/profile.mjs";
import { captureBackup, encodeBackup, decodeBackup } from "../js/backup.mjs";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const data = read("../js/content.json"),
  baseline = read("../scripts/content-v1-baseline.json"),
  topicBaseline = read("../scripts/content-topic-baseline.json"),
  topicPolicy = read("../scripts/content-topic-policy.json"),
  depthPolicy = read("../scripts/content-depth-policy.json"),
  depthBaseline = read("../scripts/content-depth-baseline.json");
const priorPolish = read("../scripts/content-language-baseline.json");
const players = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Player ${i}`,
    team: i % 2,
  }));
const deck = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id${i}`,
    en: `Word ${i}`,
    zh: `詞${i}`,
  }));
const settings = {
  ...defaults,
  mode: "coop",
  roundsEach: 3,
  drawPolicy: "unique",
};
test("unique games reserve every turn and every drawn answer stays unique across all supported schedules", () => {
  let scenarios = 0;
  for (const mode of G.MODES)
    for (let n = 2; n <= 12; n++)
      for (const roundsEach of [1, 2, 3]) {
        if (
          (mode === "coop" && n !== 2) ||
          (mode === "individual" && n < 3) ||
          (mode === "teams" && n < 4)
        )
          continue;
        const p = players(n),
          s = { ...settings, mode, roundsEach },
          turns = G.scheduleFor(p, mode, roundsEach).length;
        for (const spare of [0, 1, turns]) {
          const count = Math.max(5, turns) + spare;
          let g = G.newGame(p, s, deck(count), 1000);
          const drawn = new Set();
          let swaps = 0;
          const remember = () => {
            assert.ok(!drawn.has(g.word.id));
            drawn.add(g.word.id);
          };
          while (!g.finished) {
            assert.ok(G.validGame(g));
            assert.ok(G.reveal(g));
            remember();
            const expected = count - drawn.size > turns - g.turn - 1;
            assert.equal(G.canSwap(g), expected);
            if (expected) {
              assert.ok(G.swap(g));
              swaps++;
              remember();
              assert.equal(G.swap(g), false);
            } else assert.equal(G.swap(g), false);
            assert.ok(G.start(g, 2000));
            g = G.snapshot(g, 2100);
            assert.ok(G.validGame(g));
            assert.ok(G.resume(g, 3000));
            assert.ok(G.end(g, "giveup", null, 3100));
            // Score-result undo must not refund a drawn card or repeat it in another turn.
            const pos = g.deckPos;
            assert.ok(G.undo(g));
            assert.equal(g.deckPos, pos);
            assert.ok(G.validGame(g));
            assert.ok(G.end(g, "giveup", null, 3100));
            assert.ok(G.validGame(g));
            assert.ok(G.next(g));
          }
          assert.equal(g.history.length, turns);
          assert.equal(new Set(g.history.map((h) => h.word.id)).size, turns);
          assert.equal(drawn.size, turns + swaps);
          assert.ok(G.validGame(g));
          scenarios++;
        }
      }
  assert.equal(scenarios, 180);
});
test("unique capacity errors and invalid snapshots fail closed; old saved policy still cycles", () => {
  assert.equal(G.setupError(players(2), settings, deck(5)), "uniquePool");
  assert.equal(
    G.setupError(players(2), settings, [...deck(5), deck(1)[0]]),
    "uniquePool",
  );
  const tooShort = G.newGame(
    players(2),
    { ...settings, roundsEach: 2 },
    deck(5),
    1000,
  );
  tooShort.deck.pop();
  assert.equal(G.validGame(tooShort), false);
  let g = G.newGame(players(2), settings, deck(6), 1000);
  let bad = G.clone(g);
  bad.settings.drawPolicy = "anything";
  assert.equal(G.validGame(bad), false);
  bad = G.clone(g);
  bad.deckPos = 1;
  assert.equal(G.validGame(bad), false);
  bad = G.clone(g);
  bad.deck[5] = bad.deck[0];
  assert.equal(G.validGame(bad), false);
  G.reveal(g);
  bad = G.clone(g);
  bad.deckPos = 0;
  assert.equal(G.validGame(bad), false);
  bad = G.clone(g);
  bad.word = bad.deck[5];
  assert.equal(G.validGame(bad), false);
  const legacy = { ...settings };
  delete legacy.drawPolicy;
  g = G.newGame(players(2), legacy, deck(5), 1000);
  while (!g.finished) {
    assert.ok(G.reveal(g));
    assert.ok(G.swap(g));
    G.start(g, 1000);
    G.end(g, "giveup", null, 1100);
    G.next(g);
    assert.ok(G.validGame(g));
  }
  assert.equal(g.history.length, 6);
});
test("reviewed content preserves historical IDs and parks experimental decks while keeping ordinary subjects", () => {
  const active = data.words.filter((w) => w.review !== "held"),
    byId = new Map(priorPolish.words.map((w) => [w.id, w]));
  const originalActive = topicBaseline.words.filter((w) => w.review !== "held");
  const originalHeld = topicBaseline.words.filter((w) => w.review === "held");
  assert.equal(originalActive.length, 612);
  assert.equal(originalHeld.length, 456);
  assert.equal(topicBaseline.words.length, 1068);
  assert.equal(
    topicBaseline.words.filter((w) => w.id.startsWith("n:")).length,
    420,
  );
  for (const old of originalActive) {
    const expected = {
      ...old,
      topic:
        depthPolicy.wordTopics[old.id] ||
        topicPolicy.wordTopics[old.id] ||
        topicPolicy.baseTopicMap[old.topic],
    };
    assert.deepEqual(
      byId.get(old.id),
      expected,
      `historical active card ${old.id} only changes subject`,
    );
  }
  for (const old of originalHeld)
    assert.deepEqual(
      byId.get(old.id),
      old,
      `historical held card ${old.id} stays exact`,
    );
  for (const old of baseline.words) {
    assert.ok(byId.has(old.id));
    if (old.review === "held") assert.deepEqual(byId.get(old.id), old);
  }
  assert.equal(depthBaseline.words.length, 1141);
  assert.equal(
    depthBaseline.words.filter((w) => w.review !== "held").length,
    685,
  );
  assert.deepEqual(Object.keys(data.topics), depthPolicy.keys);
  assert.ok(!Object.hasOwn(data.topics, "hongkong"));
  assert.deepEqual(Object.keys(data.collections), ["starter"]);
  for (const w of active) {
    assert.ok(Object.hasOwn(data.topics, w.topic));
    assert.ok(["easy", "medium"].includes(w.difficulty));
    assert.ok(!w.tags.includes("silly"));
  }
  for (const [key, c] of Object.entries(data.collections)) {
    assert.ok(c.wordIds.length >= 36);
    assert.equal(new Set(c.wordIds).size, c.wordIds.length);
    const words = c.wordIds.map((id) => byId.get(id));
    assert.ok(words.every((w) => w.review === "candidate"));
    if (key === "starter")
      assert.ok(words.every((w) => w.starter && w.difficulty === "easy"));
    if (key === "silly")
      assert.ok(words.every((w) => w.tags.includes("silly")));
    if (key === "challenge")
      assert.ok(words.every((w) => w.difficulty === "expert"));
  }
  for (const [code, c] of Object.entries(catalogs)) {
    const labels = active.map((w) =>
      c.words[w.id].normalize("NFKC").trim().toLocaleLowerCase(),
    );
    assert.equal(
      new Set(labels).size,
      active.length,
      `${code} has no homonymous cards`,
    );
  }
});
test("all language pairs build unique decks; legacy selection and exact saved labels still work", () => {
  const codes = Object.keys(catalogs),
    original = JSON.stringify(data);
  for (const first of codes)
    for (const second of codes) {
      const pair = first === second ? first : `${first}+${second}`;
      const d = makeDeck(
        data,
        [],
        { topic: "mixed", difficulty: "general" },
        false,
        (w) => cardLines(w, pair).map((x) => x.text),
      );
      assert.equal(
        d.length,
        data.words.filter((w) => w.review !== "held").length,
      );
      assert.equal(new Set(d.map((w) => w.id)).size, d.length);
    }
  for (const [from, to] of Object.entries({
    hongkong: "mixed",
    fairytales: topicPolicy.topicAliases.fantasy,
    festivals: topicPolicy.topicAliases.celebrations,
    cartoons: topicPolicy.topicAliases.fantasy,
    space: topicPolicy.topicAliases.science,
  }))
    assert.equal(resolveTopic(data, from), resolveTopic(data, to));
  assert.ok(!topicChoices(data, true).includes("hongkong"));
  const alias = makeDeck(data, [], {
      topic: "hongkong",
      difficulty: "general",
    }),
    mixed = makeDeck(data, [], { topic: "mixed", difficulty: "general" });
  assert.deepEqual(alias, mixed);
  for (const old of baseline.words.filter((w) => w.review !== "held")) {
    for (const code of codes) {
      const lines = cardLines(old, code);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].original, false);
    }
    const fake = { ...old, en: "My private custom text" };
    assert.equal(cardLines(fake, "ja")[0].text, fake.en);
  }
  assert.equal(JSON.stringify(data), original);
});
test("custom words stay literal and extended difficulty profiles and games survive backup", async () => {
  const custom = [
    "MY SAVED WORD",
    "保留自訂詞庫",
    "Mi palabra",
    "独自のことば",
    "Mein Wort",
    "كلمتي",
  ];
  for (const difficulty of ["easy", "medium", "hard", "expert", "general"]) {
    const p = {
      version: 1,
      language: "zh",
      muted: true,
      players: players(2),
      custom,
      settings: { ...settings, difficulty, topic: "custom" },
    };
    assert.ok(validProfile(p));
    const d = makeDeck(data, custom, p.settings);
    assert.equal(d.length, 6);
    assert.ok(d.every((w) => w.id.startsWith("custom:")));
    const g = G.newGame(p.players, p.settings, d, 1000);
    G.reveal(g);
    G.start(g, 2000);
    g.strokes = [
      {
        color: "#243450",
        width: 3,
        points: [
          [0, 0],
          [1, 1],
        ],
      },
    ];
    G.end(g, "giveup", null, 2100);
    const raw = new Map([["pp_custom_words", '["舊自訂詞"]']]);
    const payload = captureBackup(
      { getItem: (k) => raw.get(k) ?? null },
      { profile: p, game: G.snapshot(g, 2200), last: null },
      [],
    );
    const parts = await encodeBackup(payload, 2048);
    const decoded = await decodeBackup(
      parts.map((part) => ({
        size: Buffer.byteLength(part.text),
        text: async () => part.text,
      })),
    );
    assert.deepEqual(decoded.current.profile, p);
    assert.deepEqual(decoded.current.game, g);
    assert.equal(payload.raw.pp_custom_words, '["舊自訂詞"]');
  }
});

test("parked cards stay readable in saves and never enter a new mainstream pool or replay", () => {
  const parked = data.words.filter((w) => w.heldReason);
  assert.equal(parked.length, 401);
  assert.equal(topicBaseline.shippedWordIds.length, 1018);
  assert.deepEqual(
    data.shippedWordIds.filter((id) =>
      topicBaseline.shippedWordIds.includes(id),
    ),
    topicBaseline.shippedWordIds,
  );
  assert.equal(
    data.shippedWordIds.length,
    1018 + topicPolicy.expectedAdditions + depthPolicy.expectedAdditions,
  );
  assert.deepEqual(difficultyKeys, ["easy", "medium", "general"]);
  assert.equal(resolveDifficulty("expert"), "general");
  assert.ok(isPausedSelection({ topic: "silly", difficulty: "general" }));
  assert.ok(isPausedSelection({ topic: "mixed", difficulty: "expert" }));
  for (const topic of [
    ...topicChoices(data, true),
    "starter",
    "silly",
    "challenge",
  ])
    for (const difficulty of [...difficultyKeys, "hard", "expert"]) {
      const d = makeDeck(data, ["Saved personal phrase"], {
        topic,
        difficulty,
      });
      assert.ok(
        d.every(
          (w) =>
            w.id.startsWith("custom:") ||
            (w.review !== "held" &&
              w.difficulty !== "expert" &&
              !w.tags.includes("silly")),
        ),
      );
    }
  const oldSettings = { ...settings, topic: "challenge", difficulty: "expert" };
  const oldDeck = parked.filter((w) => w.difficulty === "expert");
  const g = G.newGame(players(2), oldSettings, oldDeck, 1000);
  G.reveal(g);
  assert.ok(G.validGame(g));
  const before = JSON.stringify(g);
  for (const w of parked)
    for (const code of Object.keys(catalogs)) {
      assert.ok(catalogs[code].words[w.id]);
      assert.equal(cardLines(w, code)[0].original, false);
      assert.equal(cardLines(w, code)[0].text, catalogs[code].words[w.id]);
    }
  assert.deepEqual(eligibleReplayDeck(data, g.deck), []);
  assert.equal(JSON.stringify(g), before);
  const ordinary = data.words.find((w) => w.review === "candidate");
  const custom = { id: "custom:keep me", en: "Keep me", zh: "" };
  assert.deepEqual(eligibleReplayDeck(data, [oldDeck[0], ordinary, custom]), [
    ordinary,
    custom,
  ]);
});
