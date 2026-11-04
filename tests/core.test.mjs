import test from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/core.mjs";
import { storageAdapter, migrateLegacy } from "../js/storage.mjs";
import { messages } from "../js/i18n.mjs";
const words = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  en: `word ${i}`,
  zh: `詞${i}`,
}));
const people = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Player ${i}`,
    team: i % 2,
  }));
const settings = {
  mode: "individual",
  surface: "canvas",
  cardLanguage: "both",
  seconds: 30,
  roundsEach: 1,
};
const create = (mode = "individual", n = 3) =>
  G.newGame(people(n), { ...settings, mode }, words, 1000);
function drawing(g) {
  G.reveal(g);
  G.start(g, 1000);
}
test("individual awards exactly drawer + guesser, rejects self and duplicate, undo restores history", () => {
  const g = create();
  drawing(g);
  assert.equal(G.end(g, "correct", "0", 1500), false);
  assert.equal(G.end(g, "correct", "1", 1500), true);
  assert.deepEqual(
    g.players.map((p) => p.score),
    [1, 1, 0],
  );
  assert.equal(G.end(g, "correct", "2", 1600), false);
  assert.equal(g.history.length, 1);
  G.undo(g);
  assert.deepEqual(
    g.players.map((p) => p.score),
    [0, 0, 0],
  );
  assert.equal(g.history.length, 0);
  assert.equal(g.timer.running, false);
  assert.equal(G.validGame(g), true);
});
test("co-op shared score, no meaningless individual winner points", () => {
  const g = create("coop", 2);
  drawing(g);
  G.end(g, "correct", "1", 2000);
  assert.equal(g.successes, 1);
  assert.deepEqual(
    g.players.map((p) => p.score),
    [0, 0],
  );
  G.undo(g);
  assert.equal(g.successes, 0);
});
test("teams alternate, either team can guess, no double player score", () => {
  const g = create("teams", 5);
  assert.deepEqual(g.schedule, [0, 1, 2, 3, 4, 1]);
  drawing(g);
  assert.equal(G.end(g, "correct", "1", 2000), true);
  assert.deepEqual(g.teamScores, [0, 1]);
  assert.ok(g.players.every((p) => p.score === 0));
  G.undo(g);
  assert.deepEqual(g.teamScores, [0, 0]);
});
test("deadlines win over late answer clicks; timeout cannot be early", () => {
  const g = create();
  drawing(g);
  assert.equal(G.end(g, "timeout", null, 2000), false);
  assert.equal(G.end(g, "correct", "1", 31000), true);
  assert.equal(g.result.type, "timeout");
  assert.equal(g.successes, 0);
});
test("snapshot freezes exact remaining time without changing running live game", () => {
  const g = create();
  drawing(g);
  const saved = G.snapshot(g, 3500);
  assert.equal(saved.timer.msLeft, 27500);
  assert.equal(saved.timer.running, false);
  assert.equal(g.timer.running, true);
  G.resume(saved, 900000);
  assert.equal(G.remaining(saved, 901000), 26500);
});
test("draw once per handoff, swap once, disabled after starting", () => {
  const g = create();
  assert.equal(G.reveal(g), true);
  const first = g.word.id;
  assert.equal(G.reveal(g), false);
  assert.equal(G.swap(g), true);
  assert.notEqual(g.word.id, first);
  assert.equal(G.swap(g), false);
  G.start(g, 1);
  assert.equal(G.swap(g), false);
  assert.equal(g.deckPos, 2);
});
test("complete match, no double advances, preserves exact history and turn count", () => {
  const g = create();
  for (let turn = 0; turn < 3; turn++) {
    assert.equal(g.turn, turn);
    drawing(g);
    G.end(g, "giveup", null, 1001);
    assert.equal(G.validGame(g), true);
    G.next(g);
    assert.equal(G.next(g), false);
  }
  assert.equal(g.finished, true);
  assert.equal(g.history.length, 3);
  assert.equal(G.validGame(g), true);
  assert.equal(G.undo(g), false);
});
test("rejects malformed nested saves rather than crashing later", () => {
  const g = create();
  drawing(g);
  assert.equal(G.validGame(g), true);
  for (const mutate of [
    (g) => (g.players[0].score = -1),
    (g) => (g.deck[0].en = {}),
    (g) => (g.schedule = [99]),
    (g) => (g.timer.msLeft = NaN),
    (g) => (g.strokes = [{}]),
    (g) => (g.phase = "result"),
    (g) => (g.clearUndo = [{}]),
  ]) {
    const bad = G.clone(g);
    mutate(bad);
    assert.equal(G.validGame(bad), false);
  }
  assert.equal(G.validGame({}), false);
});
test("setup restrictions and deck minimum", () => {
  assert.equal(G.setupError(people(2), settings, words), "individualCount");
  assert.equal(
    G.setupError(people(4), { ...settings, mode: "coop" }, words),
    "coopCount",
  );
  const p = people(4);
  p[1].team = 0;
  assert.equal(
    G.setupError(p, { ...settings, mode: "teams" }, words),
    "teamCount",
  );
  assert.equal(
    G.setupError(people(3), settings, words.slice(0, 4)),
    "deckCount",
  );
});
test("corrupt raw data preserved, failed reads block overwrites, no unowned removals", () => {
  const data = new Map([
    ["game", "{bad"],
    ["other", "preserve"],
  ]);
  const notices = [];
  const adapter = storageAdapter(
    {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    },
    (x) => notices.push(x),
  );
  assert.equal(adapter.read("game"), null);
  assert.equal(adapter.write("game", {}), false);
  assert.equal(data.get("game"), "{bad");
  adapter.remove("game");
  assert.equal(adapter.write("game", { valid: true }), true);
  assert.equal(data.get("other"), "preserve");
  assert.ok(notices.includes("storageRead"));
});
test("quota failure is visible", () => {
  let issue;
  const adapter = storageAdapter(
    {
      setItem() {
        throw new Error("quota");
      },
    },
    (x) => (issue = x),
  );
  assert.equal(adapter.write("x", {}), false);
  assert.equal(issue, "storageWrite");
});
test("legacy result imports original scores, undo and active drawer without touching source", () => {
  const raw = {
    players: [
      { id: "a", name: "A", score: 1 },
      { id: "b", name: "B", score: 1 },
    ],
    deck: ["cat", "dog", "tree", "sun", "moon"],
    deckPos: 1,
    drawerPos: 0,
    round: 1,
    totalRounds: 4,
    phase: "result",
    word: "cat",
    swapUsed: false,
    timer: { duration: 30000, msLeft: 25000, running: false },
    result: {
      type: "correct",
      winnerId: "b",
      msLeftAtEnd: 25000,
      deltas: [
        { id: "a", delta: 1 },
        { id: "b", delta: 1 },
      ],
    },
    history: [
      { round: 1, word: "cat", drawer: "A", winner: "B", type: "correct" },
    ],
  };
  const before = JSON.stringify(raw);
  const migrated = migrateLegacy(raw, () => null);
  assert.ok(migrated);
  assert.equal(migrated.settings.mode, "individual");
  assert.equal(G.drawer(migrated).id, "a");
  G.undo(migrated);
  assert.deepEqual(
    migrated.players.map((p) => p.score),
    [0, 0],
  );
  assert.equal(JSON.stringify(raw), before);
  assert.equal(
    migrateLegacy({ players: [] }, () => null),
    null,
  );
});
test("both interface languages have the exact same keys", () =>
  assert.deepEqual(
    Object.keys(messages.en).sort(),
    Object.keys(messages.zh).sort(),
  ));

test("candidate content has stable unique IDs, bilingual labels and curated easy entries", async () => {
  const fs = await import("node:fs/promises");
  const data = JSON.parse(
    await fs.readFile(new URL("../js/content.json", import.meta.url), "utf8"),
  );
  const wordById = new Map(data.words.map((word) => [word.id, word]));
  const baseline = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-topic-baseline.json", import.meta.url),
      "utf8",
    ),
  );
  const additions = JSON.parse(
    await fs.readFile(
      new URL("../scripts/content-topic-additions.json", import.meta.url),
      "utf8",
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
  assert.equal(baseline.words.length, 1068);
  assert.deepEqual(
    data.words.map((w) => w.id).sort(),
    [...baseline.words, ...additions, ...depthAdditions]
      .map((w) => w.id)
      .sort(),
  );
  assert.equal(
    data.words.length,
    baseline.words.length + additions.length + depthAdditions.length,
  );
  assert.equal(new Set(data.words.map((w) => w.id)).size, data.words.length);
  assert.ok(data.words.every((w) => G.validWord(w) && w.zh.length > 0));
  const active = data.words.filter((w) => w.review === "candidate");
  assert.equal(active.length, 609 + additions.length + depthAdditions.length);
  assert.equal(
    active.filter((w) => w.difficulty === "easy").length,
    243 +
      [...additions, ...depthAdditions].filter((w) => w.difficulty === "easy")
        .length,
  );
  assert.equal(data.words.filter((w) => w.review === "held").length, 459);
  assert.equal(
    active.some((w) => w.topic === "cartoons"),
    false,
  );

  const collectionIds = Object.values(data.collections).flatMap(
    (collection) => collection.wordIds,
  );
  assert.ok(collectionIds.length >= 108);
  for (const collection of Object.values(data.collections)) {
    assert.ok(collection.en.trim().length > 0);
    assert.ok(collection.zh.trim().length > 0);
    const members = collection.wordIds.map((id) => wordById.get(id));
    assert.ok(members.every(Boolean), "collection IDs must resolve to words");
    assert.ok(
      members.every((word) => word.review !== "held" && word.zh.trim()),
      "collections only use active words with translations",
    );
    assert.ok(
      members.length >= 36,
      "each curated playlist supports the largest standard game",
    );
  }

  const originalTranslationFixes = {
    "w:animals:cow": "牛",
    "w:occupations:florist": "花藝師",
    "w:food:cereal": "早餐穀物",
    "w:things:blanket": "毛氈",
    "w:things:scissors": "剪刀",
    "w:hongkong:typhoon-signal": "颱風信號",
    "w:fairytales:gingerbread-house": "薑餅屋",
    "w:fairytales:magic-beanstalk": "魔法豆莖",
  };
  for (const [id, translation] of Object.entries(originalTranslationFixes))
    assert.equal(wordById.get(id)?.zh, translation, `${id} translation`);
});
test("clear-canvas undo state never leaks into the next round", () => {
  const g = create();
  drawing(g);
  g.clearUndo = [{ color: "#243450", width: 3, points: [[0.2, 0.3]] }];
  G.end(g, "giveup", null, 1100);
  G.next(g);
  assert.equal(g.clearUndo, null);
  assert.deepEqual(g.strokes, []);
});
test("legacy endless game is preserved rather than silently converted to finite rules", () => {
  assert.equal(
    migrateLegacy(
      {
        players: [
          { id: "a", name: "A", score: 0 },
          { id: "b", name: "B", score: 0 },
        ],
        timer: { duration: 30000, msLeft: 30000 },
        round: 1,
        drawerPos: 0,
        totalRounds: null,
        deck: ["a", "b", "c", "d", "e"],
        deckPos: 0,
        phase: "handoff",
      },
      () => null,
    ),
    null,
  );
});

test("claiming an answer freezes time before choosing a player; late claims time out", () => {
  const g = create();
  drawing(g);
  assert.equal(G.beginJudgement(g, 1500), true);
  assert.equal(g.timer.running, false);
  assert.equal(g.timer.msLeft, 29500);
  assert.equal(G.end(g, "correct", g.players[1].id, 50000), true);
  assert.equal(g.result.type, "correct");
  const late = create();
  drawing(late);
  assert.equal(G.beginJudgement(late, 31000), false);
  assert.equal(late.result.type, "timeout");
  assert.equal(late.successes, 0);
});

test("drawing recap survives next round and rejects malformed saved artwork", () => {
  const g = create();
  drawing(g);
  g.strokes = [
    {
      color: "#243450",
      width: 7,
      points: [
        [0, 0],
        [1, 1],
      ],
    },
  ];
  G.end(g, "correct", g.players[1].id, 1500);
  assert.deepEqual(g.history[0].artwork, g.strokes);
  assert.notEqual(g.history[0].artwork, g.strokes);
  assert.equal(G.validGame(g), true);
  G.next(g);
  assert.equal(g.strokes.length, 0);
  assert.equal(g.history[0].artwork.length, 1);
  g.history[0].artwork[0].points = [[Infinity, 0]];
  assert.equal(G.validGame(g), false);
});

test("expired result can be corrected without adding drawing time or duplicate points", () => {
 const g=create("teams",4); drawing(g); G.end(g,"timeout",null,31000);
 assert.equal(G.correctResult(g,"0"),false);
 assert.equal(G.correctResult(g,"1"),true);
 assert.deepEqual(g.teamScores,[0,1]); assert.equal(g.result.msLeft,0);
 assert.equal(g.timer.running,false); assert.equal(g.history.length,1);
 assert.equal(G.correctResult(g,"2"),true);
 assert.deepEqual(g.teamScores,[1,0]); assert.equal(g.history.length,1);
 assert.equal(G.validGame(G.snapshot(g)),true);
});
test("return original consumes both revealed cards and preserves unique save invariants", () => {
 const g=G.newGame(people(2),{...settings,mode:"coop",drawPolicy:"unique"},words,1000);
 G.reveal(g); const first=g.word.id; G.swap(g); const second=g.word.id;
 assert.notEqual(first,second); assert.equal(G.validGame(G.snapshot(g)),true);
 assert.equal(G.returnOriginal(g),true); assert.equal(g.word.id,first);
 assert.equal(G.canSwap(g),false); assert.equal(G.returnOriginal(g),false);
 assert.equal(G.validGame(G.snapshot(g)),true);
 G.start(g,1000);G.end(g,"giveup",null,1500);G.next(g);G.reveal(g);
 assert.ok(![first,second].includes(g.word.id));assert.equal(G.validGame(g),true);
});
