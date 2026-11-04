import { validGame, snapshot } from "./core.mjs";
export const KEYS = {
  profile: "sg_v1_profile",
  game: "sg_v1_game",
  last: "sg_v1_last",
};
export function storageAdapter(storage, notify = () => {}) {
  const blocked = new Set();
  return {
    read(key, validate = () => true) {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const value = JSON.parse(raw);
        if (!validate(value)) throw new Error("invalid");
        return value;
      } catch {
        blocked.add(key);
        notify("storageRead");
        return null;
      }
    },
    write(key, value) {
      if (blocked.has(key)) {
        notify("storageRead");
        return false;
      }
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        notify("storageWrite");
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
        blocked.delete(key);
        return true;
      } catch {
        notify("storageWrite");
        return false;
      }
    },
    has(key) {
      try {
        return storage.getItem(key) !== null;
      } catch {
        notify("storageRead");
        return true;
      }
    },
    blocked,
  };
}
export function migrateLegacy(g, lookup) {
  // Read-only migration; never writes/deletes pp_* keys.
  try {
    if (
      !g ||
      !Array.isArray(g.players) ||
      !g.timer ||
      !Number.isInteger(g.round) ||
      !Number.isInteger(g.drawerPos)
    )
      return null;
    // Endless legacy games have no safe finite schedule in V1; preserve raw save for export.
    if (!Number.isInteger(g.totalRounds) || g.totalRounds < 1) return null;
    const word = (s) =>
      lookup(s) || {
        id: `legacy:${s}`,
        en: s,
        zh: "",
        topic: "custom",
        difficulty: "general",
        region: "custom",
      };
    const count =
      g.totalRounds ||
      Math.max(g.round + g.players.length * 2, g.players.length * 3);
    const out = {
      version: 1,
      id: "legacy-import",
      settings: {
        mode: "individual",
        surface: "paper",
        topic: g.topic || "mixed",
        difficulty: "general",
        cardLanguage: "both",
        seconds: g.timer.duration / 1000,
        roundsEach: 2,
      },
      players: g.players.map((p, i) => ({ ...p, team: i % 2 })),
      deck: g.deck.map(word),
      deckPos: g.deckPos,
      schedule: Array.from(
        { length: count },
        (_, i) =>
          (g.drawerPos + i - (g.round - 1) + count * g.players.length) %
          g.players.length,
      ),
      turn: g.round - 1,
      phase: g.phase,
      word: g.word ? word(g.word) : null,
      swapUsed: !!g.swapUsed,
      timer: { ...g.timer, running: false, endAt: null },
      teamScores: [0, 0],
      successes: (g.history || []).filter((h) => h.type === "correct").length,
      strokes: [],
      redo: [],
      history: (g.history || []).map((h) => ({ ...h, word: word(h.word) })),
      result: null,
      finished: false,
      createdAt: Date.now(),
      legacy: true,
    };
    if (g.phase === "result") {
      if (!g.result || !Array.isArray(g.result.deltas)) return null;
      out.result = {
        type: g.result.type,
        winnerId: g.result.winnerId,
        msLeft: g.result.msLeftAtEnd,
        before: {
          scores: out.players.map(
            (p) =>
              p.score -
              g.result.deltas
                .filter((d) => d.id === p.id)
                .reduce((n, d) => n + d.delta, 0),
          ),
          teams: [0, 0],
          successes: Math.max(
            0,
            out.successes - (g.result.type === "correct" ? 1 : 0),
          ),
        },
      };
      // Old saves before history shipped have no recap. Preserve the current result.
      if (!out.history.length)
        out.history.push({
          round: g.round,
          word: out.word,
          drawer: out.players[g.drawerPos].name,
          winner:
            out.players.find((p) => p.id === g.result.winnerId)?.name || null,
          type: g.result.type,
        });
    }
    return validGame(out) ? snapshot(out) : null;
  } catch {
    return null;
  }
}
