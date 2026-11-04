import { sha256 } from "./checksum.mjs";
import { KEYS } from "./storage.mjs";
import { validProfile } from "./profile.mjs";
import { validGame, snapshot } from "./core.mjs";
import { validArtwork } from "./artwork-store.mjs";

export const RESTORE_MARKER = "sg_restore_pending";
export const BACKUP_KEYS = [
  ...Object.values(KEYS),
  "pp_roster",
  "pp_settings",
  "pp_game",
  "pp_muted",
  "pp_custom_words",
];
export const MAX_BACKUP_BYTES = 256_000_000,
  PART_BYTES = 3_000_000;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const clone = (v) => JSON.parse(JSON.stringify(v));
const fail = (code) => {
  throw new Error(code);
};
export const rawSnapshot = (storage) =>
  Object.fromEntries(BACKUP_KEYS.map((k) => [k, storage.getItem(k)]));
export async function digest(bytes) {
  if (!globalThis.crypto?.subtle) return sha256(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const base64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 16000)
    s += String.fromCharCode(...bytes.subarray(i, i + 16000));
  return btoa(s);
};
export function captureBackup(storage, memory, artwork, unavailable = false) {
  return {
    format: "sketch-guess-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    raw: rawSnapshot(storage),
    inMemory: clone(memory),
    artworkArchive: artwork,
    artworkArchiveUnavailable: unavailable,
  };
}
export async function encodeBackup(data, partBytes = PART_BYTES) {
  if (data.artworkArchive?.length > 10000) fail("backupLimit");
  const bytes = encoder.encode(JSON.stringify(data));
  if (bytes.length > MAX_BACKUP_BYTES) fail("backupLimit");
  const hash = await digest(bytes),
    count = Math.ceil(bytes.length / partBytes),
    files = [];
  for (let index = 0; index < count; index++) {
    const chunk = bytes.subarray(
      index * partBytes,
      Math.min(bytes.length, (index + 1) * partBytes),
    );
    files.push({
      name: `Sketch-and-Guess-${hash.slice(0, 12)}-${index + 1}-of-${count}.json`,
      text: JSON.stringify({
        format: "sketch-guess-backup-part",
        version: 1,
        backupId: hash,
        index,
        total: count,
        bytes: bytes.length,
        sha256: await digest(chunk),
        data: base64(chunk),
      }),
    });
  }
  return files;
}
export async function decodeBackup(files) {
  if (!files.length || files.length > 128) fail("backupInvalid");
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BACKUP_BYTES * 1.5)
    fail("backupLimit");
  let parsed;
  try {
    parsed = await Promise.all(
      files.map(async (f) => JSON.parse(await f.text())),
    );
  } catch {
    fail("backupInvalid");
  }
  if (parsed[0]?.format !== "sketch-guess-backup-part") {
    if (files.length !== 1) fail("backupParts");
    return validateBackup(parsed[0]);
  }
  const first = parsed[0];
  if (
    !Number.isInteger(first.total) ||
    first.total < 1 ||
    first.total > 128 ||
    !Number.isSafeInteger(first.bytes) ||
    first.bytes < 1 ||
    first.bytes > MAX_BACKUP_BYTES ||
    !/^[a-f0-9]{64}$/.test(first.backupId)
  )
    fail("backupInvalid");
  if (files.length !== first.total) fail("backupParts");
  const chunks = new Array(first.total);
  for (const p of parsed) {
    if (
      p.format !== first.format ||
      p.version !== 1 ||
      p.backupId !== first.backupId ||
      p.total !== first.total ||
      p.bytes !== first.bytes ||
      !Number.isInteger(p.index) ||
      p.index < 0 ||
      p.index >= p.total ||
      chunks[p.index] ||
      typeof p.data !== "string" ||
      p.data.length > PART_BYTES * 1.5 ||
      typeof p.sha256 !== "string"
    )
      fail("backupParts");
    let chunk;
    try {
      chunk = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
    } catch {
      fail("backupInvalid");
    }
    if ((await digest(chunk)) !== p.sha256) fail("backupChecksum");
    chunks[p.index] = chunk;
  }
  if (chunks.reduce((n, c) => n + c.length, 0) !== first.bytes)
    fail("backupChecksum");
  const bytes = new Uint8Array(first.bytes);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  if ((await digest(bytes)) !== first.backupId) fail("backupChecksum");
  let data;
  try {
    data = JSON.parse(decoder.decode(bytes));
  } catch {
    fail("backupInvalid");
  }
  return validateBackup(data);
}
export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("backupInvalid");
  if (
    data.format !== undefined &&
    (data.format !== "sketch-guess-backup" || data.version !== 2)
  )
    fail("backupVersion");
  if (data.format === undefined && data.version !== undefined)
    fail("backupVersion");
  if (
    !data.raw ||
    typeof data.raw !== "object" ||
    Array.isArray(data.raw) ||
    !data.inMemory ||
    typeof data.inMemory !== "object"
  )
    fail("backupInvalid");
  for (const [key, value] of Object.entries(data.raw))
    if (
      !BACKUP_KEYS.includes(key) ||
      (value !== null && typeof value !== "string")
    )
      fail("backupInvalid");
  const current = {};
  for (const [name, validate] of [
    ["profile", validProfile],
    ["game", validGame],
    ["last", validGame],
  ]) {
    const raw = data.raw[KEYS[name]];
    let value = null;
    // Stored values are authoritative; in-memory snapshots only fill truly absent keys.
    if (raw !== null && raw !== undefined) {
      try {
        value = JSON.parse(raw);
      } catch {
        fail("backupInvalid");
      }
    } else value = data.inMemory[name] ?? null;
    try {
      if (value !== null && !validate(value)) fail("backupInvalid");
    } catch {
      fail("backupInvalid");
    }
    current[name] =
      value === null
        ? null
        : name === "profile"
          ? clone(value)
          : snapshot(value);
  }
  if (!Array.isArray(data.artworkArchive ?? [])) fail("backupInvalid");
  const artwork = data.artworkArchive || [],
    ids = new Set();
  if (artwork.length > 10000) fail("backupLimit");
  for (const r of artwork) {
    if (!validArtwork(r) || ids.has(r.id)) fail("backupInvalid");
    ids.add(r.id);
    if (
      r.metadata !== undefined &&
      (!r.metadata ||
        typeof r.metadata !== "object" ||
        Array.isArray(r.metadata))
    )
      fail("backupInvalid");
  }
  return {
    current,
    artwork,
    raw: clone(data.raw),
    partial: data.artworkArchiveUnavailable === true,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
  };
}
export async function makeRestorePlan(backup, storage, archive, mode = "keep") {
  if (!["keep", "backup"].includes(mode)) fail("backupInvalid");
  const before = rawSnapshot(storage),
    after = {},
    current = {};
  for (const [name, validate] of [
    ["profile", validProfile],
    ["game", validGame],
    ["last", validGame],
  ]) {
    const raw = before[KEYS[name]];
    let value = null;
    let invalid = false;
    try {
      value = raw === null ? null : JSON.parse(raw);
      invalid = value !== null && !validate(value);
    } catch {
      invalid = true;
    }
    if (invalid) {
      if (mode !== "backup" || !backup.current[name])
        fail("restoreLocalInvalid");
      value = null;
    }
    current[name] = value;
  }
  const incoming = clone(backup.current),
    remap = new Map();
  for (const source of [incoming.game, incoming.last].filter(Boolean)) {
    if (remap.has(source.id)) continue;
    let conflict = [current.game, current.last]
      .filter(Boolean)
      .some(
        (local) =>
          local.id === source.id &&
          JSON.stringify(snapshot(local)) !== JSON.stringify(snapshot(source)),
      );
    for (const r of backup.artwork.filter((r) =>
      r.id.startsWith(source.id + ":"),
    )) {
      const local = await archive.get(r.id);
      if (
        local &&
        (local.ratio !== r.ratio ||
          JSON.stringify(local.strokes) !== JSON.stringify(r.strokes))
      )
        conflict = true;
    }
    if (conflict) {
      const related = backup.artwork.filter((r) =>
        r.id.startsWith(source.id + ":"),
      );
      const base =
        "restored-" +
        (
          await digest(
            encoder.encode(
              JSON.stringify([
                source,
                related.map((r) => [r.id, r.ratio, r.strokes]),
              ]),
            ),
          )
        ).slice(0, 40);
      let namespace = null;
      for (let attempt = 0; attempt < 10000; attempt++) {
        const candidate = base + "-" + attempt;
        let occupied = [current.game, current.last]
          .filter(Boolean)
          .some(
            (local) =>
              local.id === candidate &&
              JSON.stringify({ ...snapshot(local), id: source.id }) !==
                JSON.stringify(snapshot(source)),
          );
        for (const r of related) {
          const local = await archive.get(
            candidate + r.id.slice(source.id.length),
          );
          if (
            local &&
            (local.ratio !== r.ratio ||
              JSON.stringify(local.strokes) !== JSON.stringify(r.strokes))
          )
            occupied = true;
        }
        if (!occupied) {
          namespace = candidate;
          break;
        }
      }
      if (!namespace) fail("restoreConflict");
      remap.set(source.id, namespace);
    }
  }
  for (const source of [incoming.game, incoming.last].filter(Boolean))
    if (remap.has(source.id)) source.id = remap.get(source.id);
  const localProfile = current.profile,
    importProfile = incoming.profile;
  let profile =
    mode === "backup"
      ? importProfile || localProfile
      : localProfile || importProfile;
  if (profile) {
    profile = clone(profile);
    const words = [
        ...(localProfile?.custom || []),
        ...(importProfile?.custom || []),
      ],
      seen = new Set();
    profile.custom = words.filter((w) => {
      const k = w.toLocaleLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (profile.custom.length > 200) fail("restoreWordsLimit");
    after[KEYS.profile] = JSON.stringify(profile);
  }
  for (const name of ["game", "last"]) {
    const value =
      mode === "backup"
        ? incoming[name] || current[name]
        : current[name] || incoming[name];
    if (value) after[KEYS[name]] = JSON.stringify(snapshot(value));
  }
  // Legacy source strings stay in the recovery receipt; no imported arbitrary/pp_* keys are applied.
  const artwork = [],
    counts = { added: 0, duplicates: 0, conflicts: 0 };
  const reserved = new Set();
  for (const source of backup.artwork) {
    let r = clone(source);
    for (const [from, to] of remap)
      if (r.id.startsWith(from + ":")) {
        r.id = to + r.id.slice(from.length);
        r.metadata = {
          ...r.metadata,
          createdAt:
            r.metadata?.createdAt || Number(/^game-(\d+)/.exec(from)?.[1]) || 0,
        };
        break;
      }
    let existing = await archive.get(r.id);
    const same = (v) =>
      v &&
      v.ratio === r.ratio &&
      JSON.stringify(v.strokes) === JSON.stringify(r.strokes);
    if (same(existing)) {
      counts.duplicates++;
      continue;
    }
    if (existing || reserved.has(r.id)) {
      // Content-derived alternate key is repeatable: importing the same conflict twice is harmless.
      r.id = `import-${await digest(encoder.encode(JSON.stringify([source.id, r.ratio, r.strokes])))}`;
      existing = await archive.get(r.id);
      if (same(existing) || reserved.has(r.id)) {
        counts.duplicates++;
        continue;
      }
      if (existing) fail("restoreConflict");
      counts.conflicts++;
    }
    reserved.add(r.id);
    artwork.push(r);
    counts.added++;
  }
  return {
    token:
      globalThis.crypto?.randomUUID?.() ||
      [...crypto.getRandomValues(new Uint8Array(16))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    before,
    after,
    artwork,
    verification: await Promise.all(
      artwork.map(async (r) => ({
        id: r.id,
        ratio: r.ratio,
        hash: await digest(encoder.encode(JSON.stringify(r.strokes))),
      })),
    ),
    sourceRaw: backup.raw,
    mode,
    counts,
    summary: {
      players: incoming.profile?.players.length || 0,
      words: incoming.profile?.custom.length || 0,
      game: !!incoming.game,
      last: !!incoming.last,
      localGame: !!current.game,
      profileConflict: !!(current.profile && incoming.profile),
      wordsAfter: profile?.custom.length || 0,
      partial: backup.partial,
    },
  };
}
function checkValues(storage, values) {
  for (const [key, value] of Object.entries(values))
    if (storage.getItem(key) !== value) fail("restoreConflict");
}
const writeRaw = (storage, key, value) =>
  value === null ? storage.removeItem(key) : storage.setItem(key, value);
// Recovery is idempotent. Never overwrite a third value written outside this restore.
async function recoverUnlocked(storage, archive) {
  const token = storage.getItem(RESTORE_MARKER);
  if (!token) return { status: "none" };
  const pending = await archive.pending(),
    committed = await archive.committed();
  if (committed?.token === token) {
    checkValues(storage, committed.after);
    for (const expected of committed.verification) {
      const r = await archive.get(expected.id);
      if (
        !r ||
        r.ratio !== expected.ratio ||
        (await digest(encoder.encode(JSON.stringify(r.strokes)))) !==
          expected.hash
      )
        fail("restoreRecovery");
    }
    storage.removeItem(RESTORE_MARKER);
    return { status: "completed" };
  }
  if (!pending) {
    storage.removeItem(RESTORE_MARKER);
    return { status: "unchanged" };
  }
  if (pending.token !== token) fail("restoreRecovery");
  for (const [key, after] of Object.entries(pending.after)) {
    const now = storage.getItem(key);
    if (now !== after && now !== pending.before[key]) fail("restoreRecovery");
  }
  for (const key of Object.keys(pending.after))
    writeRaw(storage, key, pending.before[key]);
  checkValues(
    storage,
    Object.fromEntries(
      Object.keys(pending.after).map((k) => [k, pending.before[k]]),
    ),
  );
  await archive.abandon();
  storage.removeItem(RESTORE_MARKER);
  return { status: "rolledBack" };
}
let nativeRestoreBusy = false;
async function withRestoreLock(work) {
  if (globalThis.navigator?.locks)
    return navigator.locks.request(
      "sg-restore",
      { ifAvailable: true },
      (lock) => {
        if (!lock) fail("restoreBusy");
        return work();
      },
    );
  // The native app explicitly disables multiple scenes and owns one WKWebView.
  if (!globalThis.Capacitor?.isNativePlatform?.()) fail("restoreUnavailable");
  if (nativeRestoreBusy) fail("restoreBusy");
  nativeRestoreBusy = true;
  try {
    return await work();
  } finally {
    nativeRestoreBusy = false;
  }
}
export async function recoverRestore(storage, archive) {
  return withRestoreLock(() => recoverUnlocked(storage, archive));
}
export async function applyRestore(plan, storage, archive) {
  return withRestoreLock(() => applyUnlocked(plan, storage, archive));
}
async function applyUnlocked(plan, storage, archive) {
  if (storage.getItem(RESTORE_MARKER) || (await archive.pending()))
    fail("restoreBusy");
  checkValues(storage, plan.before);
  // Durable before-images precede every application write. Archive inserts and commit receipt are atomic.
  storage.setItem(RESTORE_MARKER, plan.token);
  try {
    await archive.stage(plan);
    checkValues(storage, plan.before);
    for (const [key, value] of Object.entries(plan.after))
      writeRaw(storage, key, value);
    checkValues(storage, plan.after);
    await archive.commit(plan);
    checkValues(storage, plan.after);
    for (const r of plan.artwork) {
      const got = await archive.get(r.id);
      if (
        !got ||
        JSON.stringify(got.strokes) !== JSON.stringify(r.strokes) ||
        got.ratio !== r.ratio
      )
        fail("restoreRecovery");
    }
    storage.removeItem(RESTORE_MARKER);
    return { status: "restored", ...plan.counts };
  } catch (e) {
    if ((await archive.committed())?.token === plan.token)
      fail("restoreRecovery");
    try {
      await recoverUnlocked(storage, archive);
    } catch {
      fail("restoreRecovery");
    }
    throw e;
  }
}
export async function exportBackupFile(file) {
  const bridge = globalThis.webkit?.messageHandlers?.partyBackup;
  if (bridge) return bridge.postMessage(file);
  const url = URL.createObjectURL(
    new Blob([file.text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { status: "downloaded" };
}
