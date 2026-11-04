import { validStrokes } from "./core.mjs";

export const artworkKey = (game, round) => `${game}:${round}`;
export const validArtwork = (r) =>
  !!(
    r?.version === 1 &&
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length < 160 &&
    [1, 4 / 3].includes(r.ratio) &&
    validStrokes(r.strokes)
  );
const copy = (v) => JSON.parse(JSON.stringify(v));
// Thumbnails are rebuilt solely from validated geometry; imported markup is never stored/rendered.
export function artworkMetadata(record, supplied = {}) {
  const match = /^game-(\d{13}):(\d+)$/.exec(record.id);
  const createdAt =
    Number.isSafeInteger(supplied.createdAt) &&
    supplied.createdAt > 0 &&
    supplied.createdAt < 9e15
      ? supplied.createdAt
      : match
        ? Number(match[1])
        : 0;
  const round =
    Number.isInteger(supplied.round) &&
    supplied.round > 0 &&
    supplied.round <= 10000
      ? supplied.round
      : /:(\d+)$/.test(record.id)
        ? Number(record.id.split(":").at(-1))
        : null;
  const height = 200 / record.ratio;
  let thumbnail = `<svg viewBox="0 0 200 ${height}"><rect width="200" height="${height}" fill="#ffffff"/>`;
  const stride = Math.max(
    1,
    Math.ceil(record.strokes.reduce((n, s) => n + s.points.length, 0) / 500),
  );
  for (const s of record.strokes) {
    const pts = s.points.filter(
      (_, i) => i % stride === 0 || i === s.points.length - 1,
    );
    if (s.points.length === 1)
      thumbnail += `<circle cx="${pts[0][0] * 200}" cy="${pts[0][1] * height}" r="${s.width / 8}" fill="${s.color}"/>`;
    else
      thumbnail += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${(p[0] * 200).toFixed(2)} ${(p[1] * height).toFixed(2)}`).join(" ")}" stroke="${s.color}" stroke-width="${s.width / 4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return {
    id: record.id,
    title:
      typeof supplied.title === "string" ? supplied.title.slice(0, 140) : "",
    createdAt,
    round,
    favourite: supplied.favourite === true,
    previewOnly: supplied.previewOnly === true,
    thumbnail: thumbnail + "</svg>",
    sortKey: String(createdAt).padStart(16, "0") + ":" + record.id,
  };
}
// Existing drawing records are kept byte-for-byte. Version 2 adds an independent paged catalogue and recovery journal.
export function artworkArchive(factory = globalThis.indexedDB) {
  let opening;
  function open() {
    if (!factory)
      return Promise.reject(new Error("Artwork storage unavailable"));
    if (!opening)
      opening = new Promise((resolve, reject) => {
        const r = factory.open("sg_artwork_v1", 2);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("drawings"))
            db.createObjectStore("drawings", { keyPath: "id" });
          if (!db.objectStoreNames.contains("catalogue"))
            db.createObjectStore("catalogue", { keyPath: "id" }).createIndex(
              "order",
              "sortKey",
            );
          if (!db.objectStoreNames.contains("recovery"))
            db.createObjectStore("recovery", { keyPath: "id" });
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => {
            db.close();
            opening = null;
          };
          resolve(db);
        };
        r.onerror = () => {
          opening = null;
          reject(r.error);
        };
        r.onblocked = () => {
          opening = null;
          reject(new Error("Artwork storage busy"));
        };
      });
    return opening;
  }
  async function run(names, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let result;
      tx.oncomplete = () =>
        resolve(typeof result === "function" ? result() : result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error || new Error("Artwork storage failed"));
      try {
        result = action(tx);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  }
  const get = (store, key) =>
    run([store], "readonly", (tx) => {
      const r = tx.objectStore(store).get(key);
      return () => r.result;
    });
  return {
    async put(id, strokes, ratio, metadata = {}) {
      const record = { version: 1, id, strokes: copy(strokes), ratio };
      if (!validArtwork(record)) throw new Error("Invalid artwork");
      await run(["drawings", "catalogue"], "readwrite", (tx) => {
        tx.objectStore("drawings").put(record);
        const cat = tx.objectStore("catalogue"),
          r = cat.get(id);
        r.onsuccess = () =>
          cat.put(artworkMetadata(record, { ...r.result, ...metadata }));
      });
    },
    async get(id) {
      const r = await get("drawings", id);
      if (r !== undefined && !validArtwork(r))
        throw new Error("Invalid archived artwork");
      return r || null;
    },
    async all() {
      return run(["drawings", "catalogue"], "readonly", (tx) => {
        const r = tx.objectStore("drawings").getAll(),
          m = tx.objectStore("catalogue").getAll();
        return () => {
          const map = new Map(m.result.map((v) => [v.id, v]));
          return r.result.map((v) => ({
            ...v,
            metadata: map.get(v.id)
              ? {
                  title: map.get(v.id).title,
                  createdAt: map.get(v.id).createdAt,
                  round: map.get(v.id).round,
                  favourite: map.get(v.id).favourite,
                  previewOnly: map.get(v.id).previewOnly,
                }
              : undefined,
          }));
        };
      });
    },
    async indexExisting() {
      const indexed = await get("recovery", "catalogued");
      if (indexed) return { invalid: indexed.invalid };
      // Cursor batches keep the first upgrade responsive and never load the whole archive at once.
      let after = null,
        done = false,
        invalid = 0;
      while (!done) {
        const batch = await run(
          ["drawings", "catalogue"],
          "readwrite",
          (tx) => {
            let count = 0,
              tail = after,
              ended = false,
              bad = 0;
            const cat = tx.objectStore("catalogue"),
              r = tx
                .objectStore("drawings")
                .openCursor(
                  after === null ? null : IDBKeyRange.lowerBound(after, true),
                );
            r.onsuccess = () => {
              const c = r.result;
              if (!c) {
                ended = true;
                return;
              }
              tail = c.key;
              count++;
              if (validArtwork(c.value)) {
                const v = c.value,
                  q = cat.get(c.key);
                q.onsuccess = () => {
                  if (!q.result) cat.put(artworkMetadata(v));
                };
              } else bad++;
              if (count < 20) c.continue();
            };
            return () => ({ tail, ended, bad });
          },
        );
        after = batch.tail;
        done = batch.ended;
        invalid += batch.bad;
        if (!done) await new Promise((r) => setTimeout(r, 0));
      }
      await run(["recovery"], "readwrite", (tx) =>
        tx.objectStore("recovery").put({ id: "catalogued", invalid }),
      );
      return { invalid };
    },
    async page({ after = null, limit = 12, favourites = false } = {}) {
      return run(["catalogue"], "readonly", (tx) => {
        const items = [],
          r = tx
            .objectStore("catalogue")
            .index("order")
            .openCursor(
              after ? IDBKeyRange.upperBound(after, true) : null,
              "prev",
            );
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return;
          if (!favourites || c.value.favourite) items.push(c.value);
          if (items.length <= limit) c.continue();
        };
        return () => ({
          items: items.slice(0, limit),
          hasMore: items.length > limit,
          after: items[Math.min(items.length, limit) - 1]?.sortKey || null,
        });
      });
    },
    async favourite(id) {
      return run(["catalogue"], "readwrite", (tx) => {
        const s = tx.objectStore("catalogue"),
          r = s.get(id);
        r.onsuccess = () => {
          if (!r.result) {
            tx.abort();
            return;
          }
          s.put({ ...r.result, favourite: !r.result.favourite });
        };
        return () => !r.result.favourite;
      });
    },
    pending: () => get("recovery", "pending"),
    previous: () => get("recovery", "previous"),
    recoveryCopy: (id) => get("recovery", id),
    async recoveries() {
      return run(["recovery"], "readonly", (tx) => {
        const r = tx
          .objectStore("recovery")
          .openCursor(IDBKeyRange.bound("copy-", "copy-\uffff"));
        const items = [];
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return;
          items.push({ id: c.value.id, createdAt: c.value.createdAt });
          c.continue();
        };
        return () => items.reverse();
      });
    },
    async stage(plan) {
      await run(["recovery"], "readwrite", (tx) => {
        const s = tx.objectStore("recovery"),
          r = s.get("pending");
        r.onsuccess = () => {
          if (r.result) {
            tx.abort();
            return;
          }
          s.put({ ...plan, id: "pending" });
        };
      });
    },
    async commit(plan) {
      await run(["drawings", "catalogue", "recovery"], "readwrite", (tx) => {
        for (const r of plan.artwork) {
          tx.objectStore("drawings").add({
            version: 1,
            id: r.id,
            ratio: r.ratio,
            strokes: r.strokes,
          });
          tx.objectStore("catalogue").add(artworkMetadata(r, r.metadata));
        }
        // The pre-import local values remain available as a downloadable recovery copy.
        const recovery = {
          before: plan.before,
          sourceRaw: plan.sourceRaw,
          createdAt: Date.now(),
        };
        tx.objectStore("recovery").put({
          id: "copy-" + plan.token,
          ...recovery,
        });
        tx.objectStore("recovery").put({ id: "previous", ...recovery });
        tx.objectStore("recovery").delete("pending");
        tx.objectStore("recovery").put({
          id: "committed",
          token: plan.token,
          after: plan.after,
          verification: plan.verification,
        });
      });
    },
    committed: () => get("recovery", "committed"),
    async abandon() {
      await run(["recovery"], "readwrite", (tx) =>
        tx.objectStore("recovery").delete("pending"),
      );
    },
  };
}
