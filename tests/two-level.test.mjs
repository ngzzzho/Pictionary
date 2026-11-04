import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  difficultyKeys,
  resolveDifficulty,
  isPausedSelection,
  makeDeck,
  eligibleReplayDeck,
} from "../js/decks.mjs";
import * as G from "../js/core.mjs";
import { defaults, validProfile } from "../js/profile.mjs";
const data = JSON.parse(
  fs.readFileSync(new URL("../js/content.json", import.meta.url)),
);
const topicBaseline = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/content-topic-baseline.json", import.meta.url),
  ),
);
const originalActiveIds = new Set(
  topicBaseline.words.filter((w) => w.review !== "held").map((w) => w.id),
);
const settings = { ...defaults, difficulty: "medium", drawPolicy: "unique" };

test("the user's nine natural concepts are Standard; composed scenes cannot enter any future pool", () => {
  const active = data.words.filter(
    (w) => originalActiveIds.has(w.id) && w.review !== "held",
  );
  assert.equal(active.length, 609);
  assert.equal(active.filter((w) => w.difficulty === "easy").length, 243);
  assert.equal(active.filter((w) => w.difficulty === "medium").length, 366);
  for (const id of [
    "w:food:hot-pot",
    ...[
      "surgeon",
      "flight-attendant",
      "electrician",
      "beekeeper",
      "taxi-driver",
      "train-driver",
      "delivery-rider",
      "zookeeper",
    ].map((x) => `w:occupations:${x}`),
  ]) {
    const word = active.find((w) => w.id === id);
    assert.ok(word, id);
    assert.equal(word.difficulty, "medium");
  }
  const heldIds = [
    "lightning-striking-a-tree",
    "river-flowing-into-the-sea",
    "roots-breaking-a-pavement",
    "lifting-a-car-with-a-tow-truck",
    "bridge-opening-for-a-ship",
    "pulley-lifting-a-bucket",
    "rainbow-over-a-waterfall",
    "bicycle-with-a-basket",
    "car-with-a-roof-rack",
    "airplane-towing-a-banner",
    "seed-sprouting-in-a-jar",
    "kicking-a-puddle",
  ].map((x) => `n:${x}`);
  for (const id of heldIds)
    assert.equal(data.words.find((w) => w.id === id)?.review, "held");
  for (const topic of ["mixed", "starter", ...Object.keys(data.topics)])
    for (const difficulty of [...difficultyKeys, "hard", "expert"]) {
      const deck = makeDeck(data, [], { ...settings, topic, difficulty });
      assert.ok(deck.every((w) => !heldIds.includes(w.id)));
      assert.ok(deck.every((w) => ["easy", "medium"].includes(w.difficulty)));
    }
  assert.deepEqual(
    eligibleReplayDeck(
      data,
      data.words.filter((w) => heldIds.includes(w.id)),
    ),
    [],
  );
});

test("both available levels support every mixed-topic player/round configuration with one swap each turn", () => {
  assert.deepEqual(difficultyKeys, ["easy", "medium", "general"]);
  for (const difficulty of difficultyKeys) {
    const deck = makeDeck(data, [], { ...settings, difficulty });
    for (const mode of G.MODES)
      for (let count = 2; count <= 12; count++)
        for (const roundsEach of [1, 2, 3]) {
          if (
            (mode === "coop" && count !== 2) ||
            (mode === "individual" && count < 3) ||
            (mode === "teams" && count < 4)
          )
            continue;
          const players = Array.from({ length: count }, (_, i) => ({
            id: String(i),
            name: `P${i}`,
            team: i % 2,
          }));
          const current = { ...settings, mode, roundsEach, difficulty };
          assert.equal(G.setupError(players, current, deck), "");
          const g = G.newGame(players, current, deck);
          for (let turn = 0; turn < g.schedule.length; turn++) {
            assert.ok(G.reveal(g));
            assert.ok(G.swap(g), "Every scheduled turn has one spare swap");
            G.start(g, 1000);
            G.end(g, "giveup", null, 1100);
            G.next(g);
            assert.ok(G.validGame(g));
          }
          assert.equal(g.history.length, g.schedule.length);
        }
  }
});

test("old Hard settings stay valid and immutable while future play resolves to Standard", () => {
  const historical = {
    ...settings,
    mode: "coop",
    difficulty: "hard",
    roundsEach: 1,
  };
  const profile = {
    version: 1,
    language: "zh",
    muted: true,
    players: [
      { id: "a", name: "A", team: 0 },
      { id: "b", name: "B", team: 1 },
    ],
    custom: ["Keep literal custom phrase"],
    settings: historical,
  };
  assert.ok(validProfile(profile));
  const before = JSON.stringify(profile);
  assert.equal(resolveDifficulty(historical.difficulty), "medium");
  assert.ok(isPausedSelection(historical));
  assert.equal(JSON.stringify(profile), before);
  const historicalDeck = data.words
    .filter((w) => w.difficulty === "hard")
    .slice(0, 8);
  assert.equal(historicalDeck.length, 8);
  const g = G.newGame(profile.players, historical, historicalDeck, 1000);
  G.reveal(g);
  const saved = G.snapshot(g, 1100);
  assert.ok(G.validGame(saved));
  assert.equal(saved.settings.difficulty, "hard");
  assert.deepEqual(saved.deck, g.deck);
  assert.deepEqual(saved.word, g.word);
});
