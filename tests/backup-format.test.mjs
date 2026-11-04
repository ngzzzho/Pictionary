import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../js/core.mjs";
import { defaults } from "../js/profile.mjs";
import { KEYS } from "../js/storage.mjs";
import {
  BACKUP_KEYS,
  captureBackup,
  decodeBackup,
  encodeBackup,
  makeRestorePlan,
  validateBackup,
} from "../js/backup.mjs";

const words = Array.from({ length: 8 }, (_, i) => ({
  id: `w${i}`,
  en: `Word ${i}`,
  zh: `詞語${i}`,
  topic: "things",
  difficulty: "easy",
  region: "general",
}));
const profile = (names = ["Ada", "Bo", "Cy"], custom = []) => ({
  version: 1,
  language: "en",
  muted: false,
  players: names.map((name, i) => ({ id: `p${i}`, name, team: i % 2 })),
  custom,
  settings: { ...defaults },
});
const game = (now = 1_700_000_000_000) =>
  newGame(
    profile().players,
    { ...defaults, mode: "individual", roundsEach: 1 },
    words,
    now,
  );
const memory = (p = profile(), g = game()) => ({ profile: p, game: g, last: null });
const archiveRecord = (id, x = 0.1) => ({
  version: 1,
  id,
  ratio: 1,
  strokes: [{ color: "#123abc", width: 7, points: [[x, 0.2], [0.8, 0.9]] }],
});
const raw = () => Object.fromEntries(BACKUP_KEYS.map((key) => [key, null]));
const backupData = (overrides = {}) => ({
  format: "sketch-guess-backup",
  version: 2,
  exportedAt: "2026-10-13T00:00:00.000Z",
  raw: raw(),
  inMemory: memory(),
  artworkArchive: [],
  artworkArchiveUnavailable: false,
  ...overrides,
});
const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};
const fakeArchive = (initial = []) => {
  const records = new Map(initial.map((item) => [item.id, structuredClone(item)]));
  return {
    records,
    async get(id) { return records.get(id) ?? null; },
  };
};
const file = (text) => ({ size: Buffer.byteLength(text), async text() { return text; } });
const code = (name) => (error) => error?.message === name;

test("capture records only owned keys and clones the in-memory state", () => {
  const local = storage({ [KEYS.profile]: "stored", pp_settings: "legacy", unrelated: "leave out" });
  const m = memory();
  const art = [archiveRecord("game-1700000000000:1")];
  const captured = captureBackup(local, m, art, true);
  assert.equal(captured.format, "sketch-guess-backup");
  assert.equal(captured.version, 2);
  assert.deepEqual(Object.keys(captured.raw).sort(), [...BACKUP_KEYS].sort());
  assert.equal(captured.raw[KEYS.profile], "stored");
  assert.equal(captured.raw.pp_settings, "legacy");
  assert.equal("unrelated" in captured.raw, false);
  assert.notEqual(captured.inMemory, m);
  assert.equal(captured.artworkArchiveUnavailable, true);
  assert.equal(captured.artworkArchive, art);
});

test("multipart backup round-trips bilingual UTF-8 and files may be selected out of order", async () => {
  const playerNames = ["阿晴", "Māori family", "Élodie"];
  const p = profile(playerNames, ["雪人", "火龍"]).players;
  const data = backupData({
    inMemory: memory(profile(playerNames, ["雪人", "火龍"])),
    artworkArchive: [archiveRecord("draw-漢字-1")],
  });
  const parts = await encodeBackup(data, 257);
  assert.ok(parts.length > 1);
  const decoded = await decodeBackup(parts.slice().reverse().map((part) => file(part.text)));
  assert.deepEqual(decoded.current.profile.players.map((x) => x.name), playerNames);
  assert.deepEqual(decoded.current.profile.custom, ["雪人", "火龍"]);
  assert.equal(decoded.artwork[0].id, "draw-漢字-1");
  assert.equal(decoded.exportedAt, data.exportedAt);
});

test("rejects unknown versions, damaged checksums, missing/duplicate/mixed parts", async () => {
  const data = backupData();
  assert.throws(() => validateBackup({ ...data, version: 99 }), code("backupVersion"));
  const parts = await encodeBackup(data, 256);
  assert.ok(parts.length > 1);
  const files = (xs) => xs.map((part) => file(part.text));
  await assert.rejects(decodeBackup(files(parts.slice(1))), code("backupParts"));
  await assert.rejects(decodeBackup(files([parts[0], parts[0], ...parts.slice(2)])), code("backupParts"));
  const mixed = parts.slice();
  mixed[1] = { name: "mixed.json", text: JSON.stringify({ format: "other-part", version: 1 }) };
  await assert.rejects(decodeBackup(files(mixed)), code("backupParts"));
  const changed = JSON.parse(parts[0].text);
  changed.data = `${changed.data.slice(0, -4)}AAAA`;
  const corrupt = parts.slice();
  corrupt[0] = { name: parts[0].name, text: JSON.stringify(changed) };
  await assert.rejects(decodeBackup(files(corrupt)), code("backupChecksum"));
});

test("rejects arbitrary raw keys and malformed profile, game, or artwork records", () => {
  assert.throws(() => validateBackup(backupData({ raw: { ...raw(), localStorageAttack: "{}" } })), code("backupInvalid"));
  const badProfile = profile();
  badProfile.players[0].team = 7;
  assert.throws(() => validateBackup(backupData({ inMemory: memory(badProfile) })), code("backupInvalid"));
  const badGame = game();
  badGame.deckPos = -1;
  assert.throws(() => validateBackup(backupData({ inMemory: memory(profile(), badGame) })), code("backupInvalid"));
  assert.throws(() => validateBackup(backupData({ artworkArchive: [{ ...archiveRecord("x"), ratio: 2 }] })), code("backupInvalid"));
  assert.throws(() => validateBackup(backupData({ artworkArchive: [archiveRecord("same"), archiveRecord("same")] })), code("backupInvalid"));
});

test("keep-local plan merges unique custom words and preserves existing game by default", async () => {
  const localProfile = profile(["Local A", "Local B"], ["Mango", "PEAR"]);
  const localGame = game(1_700_000_000_001);
  const local = storage({
    [KEYS.profile]: JSON.stringify(localProfile),
    [KEYS.game]: JSON.stringify(localGame),
  });
  const incomingProfile = profile(["Backup A", "Backup B", "Backup C"], ["pear", "Plum"]);
  const data = backupData({
    inMemory: memory(incomingProfile, game(1_700_000_000_002)),
    raw: { ...raw(), [KEYS.profile]: JSON.stringify(incomingProfile), [KEYS.game]: JSON.stringify(game(1_700_000_000_002)) },
  });
  const validated = validateBackup(data);
  const plan = await makeRestorePlan(validated, local, fakeArchive());
  const merged = JSON.parse(plan.after[KEYS.profile]);
  assert.deepEqual(merged.players.map((p) => p.name), ["Local A", "Local B"]);
  assert.deepEqual(merged.custom, ["Mango", "PEAR", "Plum"]);
  assert.equal(plan.after[KEYS.game], JSON.stringify(localGame));
  assert.equal(plan.mode, "keep");
  assert.equal(plan.summary.profileConflict, true);
});

test("explicit backup choice replaces local profile and game while retaining nonconflicting local words", async () => {
  const localProfile = profile(["Local A", "Local B"], ["Local word"]);
  const localGame = game(1_700_000_000_011);
  const incomingProfile = profile(["Backup A", "Backup B", "Backup C"], ["Backup word"]);
  const incomingGame = game(1_700_000_000_012);
  const local = storage({
    [KEYS.profile]: JSON.stringify(localProfile),
    [KEYS.game]: JSON.stringify(localGame),
  });
  const data = validateBackup(backupData({
    raw: { ...raw(), [KEYS.profile]: JSON.stringify(incomingProfile), [KEYS.game]: JSON.stringify(incomingGame) },
    inMemory: memory(incomingProfile, incomingGame),
  }));
  const plan = await makeRestorePlan(data, local, fakeArchive(), "backup");
  const selected = JSON.parse(plan.after[KEYS.profile]);
  assert.deepEqual(selected.players.map((p) => p.name), ["Backup A", "Backup B", "Backup C"]);
  assert.deepEqual(selected.custom, ["Local word", "Backup word"]);
  assert.equal(JSON.parse(plan.after[KEYS.game]).id, incomingGame.id);
  assert.equal(plan.mode, "backup");
  await assert.rejects(makeRestorePlan(data, local, fakeArchive(), "overwrite"), code("backupInvalid"));
});

test("artwork conflicts receive deterministic IDs and a repeated import becomes duplicates", async () => {
  const source = archiveRecord("same-id-a", 0.3);
  const different = archiveRecord("same-id-b", 0.6);
  const existingA = archiveRecord("same-id-a", 0.9);
  const existingB = archiveRecord("same-id-b", 0.95);
  const data = validateBackup(backupData({ artworkArchive: [source, different] }));
  const archive = fakeArchive([existingA, existingB]);
  const store = storage();
  const first = await makeRestorePlan(data, store, archive);
  const second = await makeRestorePlan(data, store, archive);
  assert.deepEqual(first.artwork.map((x) => x.id), second.artwork.map((x) => x.id));
  assert.equal(first.counts.conflicts, 2);
  assert.equal(new Set(first.artwork.map((x) => x.id)).size, 2);
  for (const item of first.artwork) archive.records.set(item.id, item);
  const repeat = await makeRestorePlan(data, store, archive);
  assert.deepEqual(repeat.artwork, []);
  assert.deepEqual(repeat.counts, { added: 0, duplicates: 2, conflicts: 0 });
});
