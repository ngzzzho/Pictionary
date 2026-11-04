import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeDeck, eligibleReplayDeck } from "../js/decks.mjs";
import * as G from "../js/core.mjs";
import { defaults } from "../js/profile.mjs";
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const data = read("../js/content.json");
const review = read("../scripts/content-playability-review.json");
const latest = read("../scripts/content-two-level-policy.json");
const polish = read("../scripts/content-language-review.json");
const latestById = new Map(latest.entries.map((e) => [e.id, e]));

test("all 795 decisions remain traceable through the later two-level editorial policy", () => {
  assert.equal(review.entries.length, 795);
  assert.equal(new Set(review.entries.map((e) => e.id)).size, 795);
  const byId = new Map(data.words.map((w) => [w.id, w]));
  const kept = review.entries.filter((e) => e.decision === "keep");
  assert.equal(kept.length, review.expectedActive);
  const currentKept = kept.filter(
    (e) => latestById.get(e.id)?.decision !== "hold",
  );
  assert.equal(currentKept.length, latest.expectedActive);
  const historicalIds = new Set(review.entries.map((e) => e.id));
  assert.deepEqual(
    data.words
      .filter((w) => historicalIds.has(w.id) && w.review !== "held")
      .map((w) => w.id)
      .sort(),
    currentKept.filter(e => !Object.hasOwn(polish.held,e.id)).map((e) => e.id).sort(),
  );
  for (const e of review.entries) {
    assert.ok(typeof e.reason === "string" && e.reason.trim());
    const w = byId.get(e.id);
    assert.ok(w);
    const update = latestById.get(e.id);
    if (e.decision === "hold" || update?.decision === "hold") {
      assert.equal(w.review, "held");
      assert.equal(w.heldReason, update?.reason || e.reason);
    } else {
      assert.equal(e.decision, "keep");
      assert.ok(
        typeof e.drawCue === "string" && e.drawCue.trim(),
        "A concrete cue can be short, such as 五角星",
      );
      assert.equal(
        w.difficulty,
        update?.decision === "standard" ? "medium" : e.difficulty,
      );
      assert.equal(w.starter, e.starter);
      assert.ok(!e.starter || e.difficulty === "easy");
    }
  }
  const starter = makeDeck(data, [], { topic: "starter", difficulty: "easy" });
  assert.deepEqual(
    starter
      .filter((w) => historicalIds.has(w.id))
      .map((w) => w.id)
      .sort(),
    currentKept
      .filter((e) => e.starter)
      .map((e) => e.id)
      .sort(),
  );
  assert.ok(starter.length >= 36, "Quick Play supports every normal schedule");
});

test("new replay applies today's subject and difficulty, while old games and literal custom words stay intact", () => {
  const model = {
    topics: { things: {}, animals: {} },
    collections: { starter: { wordIds: ["a"] } },
    words: [
      {
        id: "a",
        en: "Cup",
        zh: "杯",
        topic: "things",
        difficulty: "easy",
        review: "candidate",
      },
      {
        id: "b",
        en: "Camera",
        zh: "相機",
        topic: "things",
        difficulty: "medium",
        review: "candidate",
      },
      {
        id: "c",
        en: "Tiger",
        zh: "老虎",
        topic: "animals",
        difficulty: "easy",
        review: "candidate",
      },
      {
        id: "d",
        en: "Secret",
        zh: "秘密",
        topic: "things",
        difficulty: "hard",
        review: "held",
      },
    ],
  };
  const own = { id: "custom:mine", en: "KEEP MY PHRASE", zh: "" };
  const historical = [
    ...model.words.map((w) => ({
      ...w,
      review: "candidate",
      difficulty: "easy",
    })),
    own,
  ];
  const original = JSON.stringify(historical);
  assert.deepEqual(
    eligibleReplayDeck(model, historical, {
      topic: "things",
      difficulty: "easy",
    }),
    [model.words[0], own],
  );
  assert.deepEqual(
    eligibleReplayDeck(model, historical, {
      topic: "mixed",
      difficulty: "general",
    }),
    [...model.words.slice(0, 3), own],
  );
  assert.deepEqual(
    eligibleReplayDeck(model, historical, {
      topic: "starter",
      difficulty: "easy",
    }),
    [model.words[0], own],
  );
  assert.equal(JSON.stringify(historical), original);
  const g = G.newGame(
    [
      { id: "a", name: "A", team: 0 },
      { id: "b", name: "B", team: 1 },
    ],
    { ...defaults, mode: "coop", roundsEach: 1 },
    historical,
    1000,
  );
  G.reveal(g);
  const saved = G.snapshot(g, 1001);
  assert.ok(G.validGame(saved));
  assert.deepEqual(saved.deck, g.deck);
  assert.deepEqual(saved.word, g.word);
});
