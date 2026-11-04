import test from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/core.mjs";
import { defaults } from "../js/profile.mjs";
import { KEYS } from "../js/storage.mjs";
import { BACKUP_KEYS, makeRestorePlan, validateBackup } from "../js/backup.mjs";

const clone = (v) => structuredClone(v);
const stroke = (x) => [
  {
    color: "#243450",
    width: 7,
    points: [
      [x, 0.2],
      [0.8, 0.9],
    ],
  },
];
function fixture() {
  const players = [0, 1].map((i) => ({
    id: `p${i}`,
    name: `Synthetic ${i}`,
    team: i,
  }));
  const settings = { ...defaults, mode: "coop", roundsEach: 3 };
  const profile = {
    version: 1,
    language: "en",
    muted: true,
    players,
    custom: [],
    settings,
  };
  const words = Array.from({ length: 8 }, (_, i) => ({
    id: `word-${i}`,
    en: `Word ${i}`,
    zh: `詞${i}`,
    topic: "things",
    difficulty: "easy",
  }));
  const game = G.newGame(players, settings, words, 1791880000000);
  const artwork = [];
  for (const x of [0.1, 0.3]) {
    G.reveal(game);
    G.start(game);
    game.strokes = stroke(x);
    G.end(game, "correct", G.eligible(game)[0].id);
    artwork.push({
      version: 1,
      id: `${game.id}:${game.turn + 1}`,
      ratio: 1,
      strokes: clone(game.strokes),
    });
    if (artwork.length === 1) G.next(game);
  }
  assert.ok(G.validGame(game));
  const backup = validateBackup({
    format: "sketch-guess-backup",
    version: 2,
    raw: Object.fromEntries(BACKUP_KEYS.map((k) => [k, null])),
    inMemory: { profile, game, last: null },
    artworkArchive: artwork,
  });
  const values = new Map([[KEYS.profile, JSON.stringify(profile)]]);
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const records = new Map();
  const archive = { get: async (id) => clone(records.get(id) || null) };
  const apply = (plan) => {
    for (const [k, v] of Object.entries(plan.after)) storage.setItem(k, v);
    for (const r of plan.artwork) {
      assert.equal(records.has(r.id), false);
      records.set(r.id, clone(r));
    }
  };
  const assertRecap = (plan, lookup) => {
    const restored = JSON.parse(plan.after[KEYS.game]);
    for (const h of restored.history) {
      const original = artwork.find((r) => r.id === `${game.id}:${h.round}`);
      const selected = lookup(`${restored.id}:${h.round}`);
      assert.ok(selected, `Missing archive association for round ${h.round}`);
      assert.deepEqual(selected.strokes, original.strokes);
    }
    return restored;
  };
  return {
    game,
    artwork,
    backup,
    storage,
    records,
    archive,
    apply,
    assertRecap,
  };
}

test("restore retains canonical and previously restored conflicts while keeping every recap linked; repeat is duplicate", async () => {
  const f = fixture();
  const originalLocal = { ...clone(f.artwork[0]), strokes: stroke(0.6) };
  f.records.set(originalLocal.id, originalLocal);
  const first = await makeRestorePlan(f.backup, f.storage, f.archive, "backup");
  assert.equal(first.counts.added, 2);
  const firstGame = f.assertRecap(first, (id) =>
    first.artwork.find((r) => r.id === id),
  );
  assert.notEqual(firstGame.id, f.game.id);
  f.apply(first);
  // A player subsequently changes this restored game's drawing. Re-importing
  // must not attach the original backup recap to this changed local image.
  const occupied = `${firstGame.id}:1`;
  const changed = { ...clone(f.records.get(occupied)), strokes: stroke(0.7) };
  f.records.set(occupied, changed);
  const second = await makeRestorePlan(
    f.backup,
    f.storage,
    f.archive,
    "backup",
  );
  const secondGame = f.assertRecap(second, (id) =>
    second.artwork.find((r) => r.id === id),
  );
  assert.notEqual(secondGame.id, firstGame.id);
  assert.notEqual(secondGame.id, f.game.id);
  f.apply(second);
  assert.deepEqual(f.records.get(originalLocal.id), originalLocal);
  assert.deepEqual(f.records.get(occupied), changed);
  const size = f.records.size;
  const repeat = await makeRestorePlan(
    f.backup,
    f.storage,
    f.archive,
    "backup",
  );
  assert.equal(repeat.counts.added, 0);
  assert.equal(repeat.counts.duplicates, 2);
  const repeatedGame = f.assertRecap(repeat, (id) => f.records.get(id));
  assert.equal(repeatedGame.id, secondGame.id);
  f.apply(repeat);
  assert.equal(f.records.size, size);
  assert.deepEqual(f.records.get(originalLocal.id), originalLocal);
  assert.deepEqual(f.records.get(occupied), changed);
});
