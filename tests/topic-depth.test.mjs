import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { makeDeck, resolveTopic, selectedTopics } from "../js/decks.mjs";
import { defaults, validProfile } from "../js/profile.mjs";
import * as G from "../js/core.mjs";
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const data = read("../js/content.json"),
  prior = read("../scripts/content-depth-baseline.json"),
  policy = read("../scripts/content-depth-policy.json"),
  additions = read("../scripts/content-depth-additions.json"),
  labels = read("../scripts/content-depth-label-baseline.json");
const priorPolish = read("../scripts/content-language-baseline.json");
const byId = new Map(priorPolish.words.map((w) => [w.id, w]));
const ids = (ws) => ws.map((w) => w.id).sort();

test("depth expansion preserves all 1141 prior records except the explicit object split and every historical label", () => {
  assert.equal(prior.words.length, 1141);
  assert.equal(prior.words.filter((w) => w.review !== "held").length, 685);
  assert.equal(
    createHash("sha256")
      .update(
        fs.readFileSync(
          new URL("../scripts/content-depth-baseline.json", import.meta.url),
        ),
      )
      .digest("hex"),
    policy.inputSHA256,
  );
  for (const old of prior.words)
    assert.deepEqual(
      byId.get(old.id),
      old.review === "held"
        ? old
        : { ...old, topic: policy.wordTopics[old.id] || old.topic },
      old.id,
    );
  assert.equal(priorPolish.words.filter((w) => w.review === "held").length, 456);
  for (const [code, old] of Object.entries(labels)) {
    assert.equal(Object.keys(old).length, 1091);
    const current = read(`../js/locales/${code}.json`).words;
    for (const [id, text] of Object.entries(old))
      assert.equal(current[id], text, `${code}:${id}`);
  }
  assert.equal(additions.length, policy.expectedAdditions);
  assert.equal(data.words.length, 1141 + additions.length);
  for (const word of additions) {
    assert.ok(
      word.drawCue.trim() && word.reason.trim() && word.nearestConfusion.trim(),
    );
    assert.ok(!prior.words.some((w) => w.id === word.id));
  }
});

test("the 191 object cards split completely into meaningful pools without losing prior future selections", () => {
  assert.deepEqual(Object.keys(data.topics), [
    "animals",
    "food",
    "home",
    "equipment",
    "actions",
    "occupations",
    "nature",
    "transport",
  ]);
  const oldObjects = prior.words.filter(
    (w) => w.review !== "held" && w.topic === "things",
  );
  assert.equal(oldObjects.length, 191);
  assert.deepEqual(Object.keys(policy.wordTopics).sort(), ids(oldObjects));
  assert.equal(
    oldObjects.filter((w) => policy.wordTopics[w.id] === "home").length,
    98,
  );
  assert.equal(
    oldObjects.filter((w) => policy.wordTopics[w.id] === "equipment").length,
    93,
  );
  assert.equal(resolveTopic(data, "things"), "home+equipment");
  assert.equal(resolveTopic(data, "things+food"), "food+home+equipment");
  assert.equal(resolveTopic(data, "home+things+equipment"), "home+equipment");
  assert.equal(resolveTopic(data, "science"), "home+equipment");
  assert.equal(resolveTopic(data, "celebrations+things"), "home+equipment");
  assert.deepEqual(selectedTopics(data, "things"), ["home", "equipment"]);
  for (const difficulty of ["easy", "medium", "general"]) {
    const old = oldObjects.filter(
      (w) => difficulty === "general" || w.difficulty === difficulty,
    );
    assert.deepEqual(
      ids(makeDeck(data, [], { topic: "things", difficulty })),
      ids(old),
    );
    const combined = prior.words.filter(
      (w) =>
        w.review !== "held" &&
        ["things", "food"].includes(w.topic) &&
        (difficulty === "general" || w.difficulty === difficulty),
    );
    const current = new Set(
      ids(makeDeck(data, [], { topic: "things+food", difficulty })),
    );
    const held = JSON.parse(fs.readFileSync(new URL("../scripts/content-language-review.json", import.meta.url))).held;
    assert.ok(combined.every((w) => current.has(w.id) || Object.hasOwn(held, w.id)));
  }
  for (const topic of [
    "things+custom",
    "things+missing",
    "things+",
    "things++food",
  ])
    assert.equal(resolveTopic(data, topic), "unavailable");
  assert.equal(resolveTopic(data, ""), "mixed");
});

test("old object-union games and profiles remain valid byte-for-byte when resumed", () => {
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `depth-${i}`,
    name: `Player ${i}`,
    team: i % 2,
  }));
  const settings = {
    ...defaults,
    topic: "things+food",
    difficulty: "general",
    drawPolicy: "unique",
  };
  const oldDeck = prior.words.filter(
    (w) => w.review !== "held" && ["things", "food"].includes(w.topic),
  );
  const game = G.newGame(players, settings, oldDeck, 1000);
  G.reveal(game);
  const snapshot = G.snapshot(game, 1100),
    bytes = JSON.stringify(snapshot);
  assert.ok(G.validGame(snapshot));
  const profile = {
    version: 1,
    language: "en",
    muted: true,
    onboardingSeen: true,
    players,
    custom: ["Own literal word"],
    settings,
  };
  assert.ok(validProfile(profile));
  assert.equal(
    resolveTopic(data, profile.settings.topic),
    "food+home+equipment",
  );
  assert.equal(JSON.stringify(snapshot), bytes);
  assert.equal(snapshot.settings.topic, "things+food");
  assert.deepEqual(ids(snapshot.deck), ids(oldDeck));
});

test("every current subject at both levels supports 36 unique turns and one swap every turn", () => {
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: `capacity-${i}`,
    name: `Player ${i}`,
    team: i % 2,
  }));
  for (const topic of Object.keys(data.topics)) {
    const settings = {
      ...defaults,
      topic,
      difficulty: "general",
      roundsEach: 3,
      drawPolicy: "unique",
    };
    const deck = makeDeck(data, [], settings);
    assert.ok(deck.length >= 72, topic);
    assert.equal(G.setupError(players, settings, deck), "", topic);
    const game = G.newGame(players, settings, deck, 1000),
      seen = new Set();
    for (let turn = 0; turn < 36; turn++) {
      assert.ok(G.reveal(game));
      assert.ok(!seen.has(game.word.id));
      seen.add(game.word.id);
      assert.ok(G.swap(game), `${topic} turn ${turn}`);
      assert.ok(!seen.has(game.word.id));
      seen.add(game.word.id);
      G.start(game, 2000);
      G.end(game, "giveup", null, 2100);
      G.next(game);
      assert.ok(G.validGame(game));
    }
    assert.ok(game.finished);
    assert.equal(seen.size, 72);
    assert.equal(game.history.length, 36);
  }
});

test("unknown topic strings cannot invoke inherited alias properties or crash restored preferences", () => {
  for (const value of [
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
  ]) {
    assert.equal(resolveTopic(data, value), "mixed");
    assert.equal(resolveTopic(data, `things+${value}`), "unavailable");
    assert.deepEqual(
      makeDeck(data, [], { topic: `things+${value}`, difficulty: "general" }),
      [],
    );
  }
});
