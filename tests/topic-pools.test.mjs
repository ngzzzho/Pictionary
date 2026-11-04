import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  makeDeck,
  resolveTopic,
  selectedTopics,
  toggleTopic,
  eligibleReplayDeck,
} from "../js/decks.mjs";
import { defaults, validProfile } from "../js/profile.mjs";
import * as G from "../js/core.mjs";
import { captureBackup, encodeBackup, decodeBackup } from "../js/backup.mjs";
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const data = read("../js/content.json"),
  baseline = read("../scripts/content-topic-baseline.json");
const keys = Object.keys(data.topics),
  active = data.words.filter((w) => w.review !== "held");
const players = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    team: i % 2,
  }));
const sorted = (ws) => ws.map((w) => w.id).sort();

test("all 255 topic unions apply an OR then the selected difficulty, with no unrelated or repeated cards", () => {
  assert.equal(keys.length, 8);
  let cases = 0;
  for (let mask = 1; mask < 1 << keys.length; mask++) {
    const chosen = keys.filter((_, i) => mask & (1 << i));
    for (const difficulty of ["easy", "medium", "general"]) {
      const settings = { ...defaults, topic: chosen.join("+"), difficulty };
      const expected = active.filter(
        (w) =>
          chosen.includes(w.topic) &&
          (difficulty === "general" || w.difficulty === difficulty),
      );
      const deck = makeDeck(data, ["Custom stays exclusive"], settings);
      assert.deepEqual(sorted(deck), sorted(expected));
      assert.deepEqual(
        sorted(
          makeDeck(data, [], {
            ...settings,
            topic: [...chosen].reverse().join("+"),
          }),
        ),
        sorted(deck),
      );
      assert.equal(new Set(deck.map((w) => w.id)).size, deck.length);
      cases++;
    }
  }
  assert.equal(cases, 765);
  assert.equal(
    makeDeck(data, [], { topic: "food+occupations", difficulty: "general" })
      .length,
    active.filter((w) => ["food", "occupations"].includes(w.topic)).length,
  );
  assert.equal(
    makeDeck(data, [], { topic: "food+occupations", difficulty: "easy" })
      .length,
    active.filter(
      (w) =>
        ["food", "occupations"].includes(w.topic) && w.difficulty === "easy",
    ).length,
  );
  assert.equal(
    makeDeck(data, [], { topic: "food+occupations", difficulty: "medium" })
      .length,
    active.filter(
      (w) =>
        ["food", "occupations"].includes(w.topic) && w.difficulty === "medium",
    ).length,
  );
});

test("selection identity is canonical, last subject cannot vanish, malformed unions never widen", () => {
  assert.equal(resolveTopic(data, "occupations+food+food"), "food+occupations");
  assert.deepEqual(selectedTopics(data, "mixed"), []);
  assert.equal(toggleTopic(data, "mixed", "food"), "food");
  assert.equal(toggleTopic(data, "food", "occupations"), "food+occupations");
  assert.equal(toggleTopic(data, "food+occupations", "food"), "occupations");
  assert.equal(toggleTopic(data, "occupations", "occupations"), "occupations");
  for (const topic of [
    "food+unknown",
    "food+mixed",
    "food+custom",
    "food+starter",
    "food+",
    "+food",
    "food++animals",
  ]) {
    assert.equal(resolveTopic(data, topic), "unavailable");
    assert.deepEqual(makeDeck(data, [], { topic, difficulty: "general" }), []);
  }
  assert.notEqual(resolveTopic(data, keys.join("+")), "mixed");
  const all = makeDeck(data, ["Own word"], {
    topic: keys.join("+"),
    difficulty: "general",
  });
  assert.equal(all.length, active.length);
  assert.equal(
    makeDeck(data, ["Own word"], { topic: "mixed", difficulty: "general" })
      .length,
    active.length + 1,
  );
  assert.equal(
    makeDeck(data, ["Own word"], { topic: "custom", difficulty: "easy" })
      .length,
    1,
  );
});

test("an undersized subject becomes playable by adding a second, and full unique games never exhaust reserved turns", () => {
  const p = players(12),
    s = {
      ...defaults,
      roundsEach: 3,
      topic: "occupations",
      difficulty: "easy",
      drawPolicy: "unique",
    };
  assert.equal(G.setupError(p, s, makeDeck(data, [], s)), "uniquePool");
  s.topic = "food+occupations";
  const deck = makeDeck(data, [], s);
  const expectedEasy = active.filter(
    (w) => ["food", "occupations"].includes(w.topic) && w.difficulty === "easy",
  );
  assert.equal(deck.length, expectedEasy.length);
  assert.ok(deck.length >= 36);
  assert.equal(G.setupError(p, s, deck), "");
  const g = G.newGame(p, s, deck, 1000);
  const ids = new Set();
  let swaps = 0;
  while (!g.finished) {
    assert.ok(G.reveal(g));
    assert.ok(!ids.has(g.word.id));
    ids.add(g.word.id);
    if (G.canSwap(g)) {
      assert.ok(G.swap(g));
      swaps++;
      assert.ok(!ids.has(g.word.id));
      ids.add(g.word.id);
    }
    G.start(g, 2000);
    G.end(g, "giveup", null, 2100);
    G.next(g);
    assert.ok(G.validGame(g));
  }
  assert.equal(g.history.length, 36);
  assert.equal(swaps, Math.min(36, deck.length - 36));
  assert.equal(ids.size, 36 + swaps);
  for (const difficulty of ["medium", "general"]) {
    const settings = { ...s, difficulty },
      game = G.newGame(p, settings, makeDeck(data, [], settings), 1000);
    for (let turn = 0; turn < 36; turn++) {
      G.reveal(game);
      assert.ok(G.swap(game));
      G.start(game, 1000);
      G.end(game, "giveup", null, 1100);
      G.next(game);
      assert.ok(G.validGame(game));
    }
  }
});

test("old active games remain exact, new replay respects the union, and backup roundtrips the selection", async () => {
  const p = players(4),
    historic = {
      ...defaults,
      topic: "fantasy",
      difficulty: "general",
      drawPolicy: "unique",
    };
  const oldDeck = baseline.words.filter(
    (w) => w.review !== "held" && w.topic === "fantasy",
  );
  const old = G.newGame(p, historic, oldDeck, 1000);
  G.reveal(old);
  const saved = G.snapshot(old, 1200),
    bytes = JSON.stringify(saved);
  const profile = {
    version: 1,
    language: "zh",
    muted: true,
    onboardingSeen: true,
    players: p,
    custom: ["My literal word"],
    settings: { ...defaults, topic: "food+occupations", difficulty: "general" },
  };
  assert.ok(validProfile(profile));
  assert.ok(G.validGame(saved));
  const replay = eligibleReplayDeck(data, active, profile.settings);
  assert.deepEqual(
    sorted(replay),
    sorted(makeDeck(data, [], profile.settings)),
  );
  assert.equal(JSON.stringify(saved), bytes);
  const payload = captureBackup(
    { getItem: () => null },
    { profile, game: saved, last: null },
    [],
  );
  const parts = await encodeBackup(payload, 4096);
  const decoded = await decodeBackup(
    parts.map((p) => ({
      size: Buffer.byteLength(p.text),
      text: async () => p.text,
    })),
  );
  assert.deepEqual(decoded.current.profile, profile);
  assert.deepEqual(decoded.current.game, saved);
});
