import { teamGuessing, validTeamGuessing } from "./team-guessing.mjs";
import { validTeamNames } from "./team-names.mjs";
import { validCardLanguages } from "./languages.mjs";
// Pure game rules. No DOM, storage, clocks or platform services.
export const MODES = ["coop", "individual", "teams"];
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function shuffled(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function setupError(players, settings, deck) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 12)
    return "playerCount";
  if (
    new Set(players.map((p) => p.id)).size !== players.length ||
    players.some((p) => !p.name?.trim())
  )
    return "playerCount";
  if (settings.mode === "coop" && players.length !== 2) return "coopCount";
  if (settings.mode === "individual" && players.length < 3)
    return "individualCount";
  if (settings.mode === "teams") {
    const a = players.filter((p) => p.team === 0).length,
      b = players.filter((p) => p.team === 1).length;
    if (
      players.length < 4 ||
      a < 2 ||
      b < 2 ||
      a + b !== players.length ||
      Math.abs(a - b) > 1
    )
      return "teamCount";
  }
  if (!validTeamGuessing(settings) || !validTeamNames(settings.teamNames)) return "invalidSettings";
  if (!MODES.includes(settings.mode)) return "invalidSettings";
  if (
    ![30, 60, 90, 120].includes(settings.seconds) ||
    ![1, 2, 3, 5, 10].includes(settings.roundsEach)
  )
    return "invalidSettings";
  if (
    !["canvas", "paper"].includes(settings.surface) ||
    !validCardLanguages(settings.cardLanguage)
  )
    return "invalidSettings";
  if (deck.length < 5) return "deckCount";
  if (settings.drawPolicy != null && settings.drawPolicy !== "unique")
    return "invalidSettings";
  if (
    settings.drawPolicy === "unique" &&
    (new Set(deck.map((w) => w.id)).size !== deck.length ||
      deck.length <
        scheduleFor(players, settings.mode, settings.roundsEach).length)
  )
    return "uniquePool";
  return "";
}
export function scheduleFor(players, mode, roundsEach, previous = null) {
  if (mode !== "teams")
    return Array.from(
      { length: players.length * roundsEach },
      (_, i) => i % players.length,
    );
  const teams = [0, 1].map((team) =>
    players.map((p, i) => (p.team === team ? i : -1)).filter((i) => i >= 0),
  );
  const offsets = teams.map((members, team) => {
    if (previous?.settings?.mode !== "teams" || !Array.isArray(previous.history)) return 0;
    const priorMembers = previous.players.filter(p => p.team === team);
    const ids = new Set(members.map(i => players[i].id));
    if (priorMembers.length !== ids.size || priorMembers.some(p => !ids.has(p.id))) return 0;
    // Only completed turns count. Abandoned/unplayed slots never advance a queue.
    const completed = previous.schedule.slice(0, previous.history.length);
    for (const index of completed.slice().reverse()) {
      const drawer = previous.players[index];
      if (drawer?.team === team) {
        const position = members.findIndex(i => players[i].id === drawer.id);
        return (position + 1) % members.length;
      }
    }
    return 0;
  });
  const turns = Math.max(...teams.map((t) => t.length)) * roundsEach;
  return Array.from(
    { length: turns * 2 },
    (_, i) => teams[i % 2][(Math.floor(i / 2) + offsets[i % 2]) % teams[i % 2].length],
  );
}
export function newGame(players, settings, deck, now = Date.now(), previous = null) {
  const error = setupError(players, settings, deck);
  if (error) throw new Error(error);
  const schedule = scheduleFor(players, settings.mode, settings.roundsEach, previous);
  return {
    version: 1,
    id: `game-${now}`,
    settings: clone(settings),
    players: players.map((p) => ({ ...p, score: 0 })),
    teamScores: [0, 0],
    successes: 0,
    deck: shuffled(deck),
    deckPos: 0,
    schedule,
    turn: 0,
    phase: "handoff",
    word: null,
    swapUsed: false,
    timer: {
      duration: settings.seconds * 1000,
      msLeft: settings.seconds * 1000,
      running: false,
      endAt: null,
    },
    canvasRatio: 1,
    strokes: [],
    redo: [],
    clearUndo: null,
    history: [],
    result: null,
    finished: false,
    createdAt: now,
  };
}
export const drawer = (g) => g.players[g.schedule[g.turn]];
export const remaining = (g, now = Date.now()) =>
  g.timer.running ? Math.max(0, g.timer.endAt - now) : g.timer.msLeft;
export function pause(g, now = Date.now()) {
  g.timer.msLeft = remaining(g, now);
  g.timer.running = false;
  g.timer.endAt = null;
}
export function snapshot(g, now = Date.now()) {
  const out = clone(g);
  delete out.checkpointRevision; // Local write identity must not survive backups/restores.
  pause(out, now);
  return out;
}
function draw(g) {
  if (g.deckPos >= g.deck.length) {
    if (g.settings.drawPolicy === "unique") return false;
    const previous = g.word?.id;
    g.deck = shuffled(g.deck);
    g.deckPos = 0;
    if (g.deck.length > 1 && g.deck[0].id === previous)
      [g.deck[0], g.deck[1]] = [g.deck[1], g.deck[0]];
  }
  g.word = g.deck[g.deckPos++];
  return true;
}
export function reveal(g) {
  if (g.finished || g.phase !== "handoff") return false;
  if (!draw(g)) return false;
  g.phase = "reveal";
  return true;
}
export function canSwap(g) {
  if (g.finished || g.phase !== "reveal" || g.swapUsed) return false;
  return (
    g.settings.drawPolicy !== "unique" ||
    g.deck.length - g.deckPos > g.schedule.length - g.turn - 1
  );
}
export function swap(g) {
  if (!canSwap(g)) return false;
  const original = clone(g.word);
  if (!draw(g)) return false;
  g.swapOriginal = original;
  g.swapUsed = true;
  return true;
}
// Both cards remain consumed; returning never grants another swap or repeats a future card.
export function returnOriginal(g) {
  if (g.finished || g.phase !== "reveal" || !g.swapUsed || !validWord(g.swapOriginal)) return false;
  const current = g.deckPos - 1;
  const original = g.deck.findIndex(w => w.id === g.swapOriginal.id);
  if (original < 0 || original === current || current < 0 ||
      (g.settings.drawPolicy === "unique" && original !== current - 1)) return false;
  [g.deck[original], g.deck[current]] = [g.deck[current], g.deck[original]];
  g.word = g.deck[current];
  delete g.swapOriginal;
  return true;
}
export function start(g, now = Date.now()) {
  if (g.finished || g.phase !== "reveal") return false;
  g.phase = "drawing";
  g.timer.msLeft = g.timer.duration;
  g.timer.running = true;
  g.timer.endAt = now + g.timer.msLeft;
  return true;
}
export function resume(g, now = Date.now()) {
  if (
    g.finished ||
    g.phase !== "drawing" ||
    g.timer.running ||
    g.timer.msLeft <= 0
  )
    return false;
  g.timer.running = true;
  g.timer.endAt = now + g.timer.msLeft;
  return true;
}
export function eligible(g) {
  const d = drawer(g);
  return g.players.filter(
    (p) => p.id !== d.id && (g.settings.mode !== "teams" || teamGuessing(g.settings) === "open" || p.team === d.team),
  );
}
// Freeze the deadline at the moment somebody claims a correct answer.
export function beginJudgement(g, now = Date.now()) {
  if (g.finished || g.phase !== "drawing") return false;
  if (remaining(g, now) <= 0) {
    end(g, "timeout", null, now);
    return false;
  }
  pause(g, now);
  return true;
}
// A bounded recap preview preserves every stroke, including white eraser strokes.
export function artworkPreview(strokes) {
  const total = strokes.reduce((n, s) => n + s.points.length, 0);
  const stride = Math.max(1, Math.ceil(total / 800));
  return strokes.map((s) => ({
    color: s.color,
    width: s.width,
    points: s.points
      .filter(
        (p, i) => i === 0 || i === s.points.length - 1 || i % stride === 0,
      )
      .map((p) => [...p]),
  }));
}
export function end(g, type, winnerId = null, now = Date.now()) {
  return endRound(g, type, winnerId, now, false);
}
function endRound(g, type, winnerId, now, correction) {
  if (
    g.finished ||
    g.phase !== "drawing" ||
    !["correct", "giveup", "timeout"].includes(type)
  )
    return false;
  // A late tap cannot score after the deadline, even if the animation loop has not run yet.
  if (!correction && remaining(g, now) <= 0) {
    type = "timeout";
    winnerId = null;
  }
  if (type === "timeout" && remaining(g, now) > 0) return false;
  const winner = eligible(g).find((p) => p.id === winnerId);
  if (type === "correct" && !winner) return false;
  pause(g, now);
  const d = drawer(g);
  const before = {
    scores: g.players.map((p) => p.score),
    teams: [...g.teamScores],
    successes: g.successes,
  };
  if (type === "correct") {
    g.successes++;
    if (g.settings.mode === "individual") {
      winner.score++;
      d.score++;
    }
    if (g.settings.mode === "teams") g.teamScores[winner.team]++;
  }
  g.result = {
    type,
    winnerId: type === "correct" ? winnerId : null,
    before,
    msLeft: g.timer.msLeft,
  };
  g.history.push({
    round: g.turn + 1,
    artwork: g.settings.surface === "canvas" ? artworkPreview(g.strokes) : [],
    canvasRatio: g.canvasRatio === 1 ? 1 : 4 / 3,
    word: clone(g.word),
    drawer: d.name,
    winner: type === "correct" ? winner.name : null,
    team: d.team,
    type,
  });
  g.phase = "result";
  return true;
}
// Explicit judge correction only; never restarts or extends an expired timer.
export function correctResult(g, winnerId) {
  if (g.finished || g.phase !== "result" || !g.result || !eligible(g).some(p => p.id === winnerId)) return false;
  undo(g);
  return endRound(g, "correct", winnerId, Date.now(), true);
}
export function undo(g) {
  if (g.finished || g.phase !== "result" || !g.result) return false;
  g.players.forEach((p, i) => (p.score = g.result.before.scores[i]));
  g.teamScores = [...g.result.before.teams];
  g.successes = g.result.before.successes;
  g.timer.msLeft = Math.max(0, g.result.msLeft);
  g.timer.running = false;
  g.timer.endAt = null;
  g.history.pop();
  g.result = null;
  g.phase = "drawing";
  return true;
}
export function next(g) {
  if (g.finished || g.phase !== "result") return false;
  if (g.turn + 1 >= g.schedule.length) {
    finish(g);
    return true;
  }
  g.turn++;
  g.phase = "handoff";
  g.word = null;
  g.swapUsed = false;
  delete g.swapOriginal;
  g.result = null;
  g.strokes = [];
  g.redo = [];
  g.clearUndo = null;
  g.timer.msLeft = g.timer.duration;
  return true;
}
export function finish(g, now = Date.now()) {
  pause(g, now);
  g.finished = true;
  g.phase = "final";
}
export function validWord(w) {
  return (
    w &&
    typeof w.id === "string" &&
    typeof w.en === "string" &&
    w.en.length <= 120 &&
    typeof w.zh === "string" &&
    w.zh.length <= 120
  );
}
const finite = (x) => typeof x === "number" && Number.isFinite(x);
export function validStrokes(strokes) {
  return (
    Array.isArray(strokes) &&
    strokes.length <= 400 &&
    strokes.every(
      (s) =>
        s &&
        /^#[0-9a-f]{6}$/i.test(s.color) &&
        [3, 7, 14, 24].includes(s.width) &&
        Array.isArray(s.points) &&
        s.points.length > 0 &&
        s.points.length <= 2000 &&
        s.points.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((n) => finite(n) && n >= 0 && n <= 1),
        ),
    )
  );
}
export function validGame(g) {
  try {
    if (
      !g ||
      g.version !== 1 ||
      !validTeamGuessing(g.settings) || !validTeamNames(g.settings?.teamNames) ||
      !MODES.includes(g.settings.mode) ||
      typeof g.id !== "string"
    )
      return false;
    if (
      !Array.isArray(g.players) ||
      g.players.length < 2 ||
      g.players.length > 12 ||
      g.players.some(
        (p) =>
          typeof p.id !== "string" ||
          typeof p.name !== "string" ||
          p.name.length > 40 ||
          !Number.isInteger(p.score) ||
          p.score < 0 ||
          ![0, 1].includes(p.team),
      )
    )
      return false;
    if (new Set(g.players.map((p) => p.id)).size !== g.players.length)
      return false;
    if (
      !["canvas", "paper"].includes(g.settings.surface) ||
      !validCardLanguages(g.settings.cardLanguage)
    )
      return false;
    if (
      !Array.isArray(g.deck) ||
      !g.deck.length ||
      g.deck.length > 2000 ||
      !g.deck.every(validWord) ||
      !Number.isInteger(g.deckPos) ||
      g.deckPos < 0 ||
      g.deckPos > g.deck.length
    )
      return false;
    if (
      !Array.isArray(g.schedule) ||
      !g.schedule.length ||
      g.schedule.length > 1000 ||
      !g.schedule.every(
        (i) => Number.isInteger(i) && i >= 0 && i < g.players.length,
      ) ||
      !Number.isInteger(g.turn) ||
      g.turn < 0 ||
      g.turn >= g.schedule.length
    )
      return false;
    if (g.settings.drawPolicy != null && g.settings.drawPolicy !== "unique")
      return false;
    if (
      g.settings.drawPolicy === "unique" &&
      (new Set(g.deck.map((w) => w.id)).size !== g.deck.length ||
        g.deck.length < Math.max(5, g.schedule.length) ||
        (!g.finished &&
          g.deck.length - g.deckPos <
            g.schedule.length - g.turn - (g.phase === "handoff" ? 0 : 1)))
    )
      return false;
    if (
      !["handoff", "reveal", "drawing", "result", "final"].includes(g.phase) ||
      typeof g.finished !== "boolean" ||
      g.finished !== (g.phase === "final") ||
      typeof g.swapUsed !== "boolean"
    )
      return false;
    if (g.swapOriginal !== undefined && (!validWord(g.swapOriginal) || !g.swapUsed || !g.deck.some(w => w.id === g.swapOriginal.id))) return false;
    if (g.phase !== "handoff" && g.phase !== "final" && !validWord(g.word))
      return false;
    if (g.word !== null && !validWord(g.word)) return false;
    if (
      !g.timer ||
      !finite(g.timer.duration) ||
      g.timer.duration < 1000 ||
      g.timer.duration > 120000 ||
      !finite(g.timer.msLeft) ||
      g.timer.msLeft < 0 ||
      g.timer.msLeft > g.timer.duration ||
      typeof g.timer.running !== "boolean" ||
      (g.timer.running && !finite(g.timer.endAt))
    )
      return false;
    if (
      !Array.isArray(g.teamScores) ||
      g.teamScores.length !== 2 ||
      !g.teamScores.every((n) => Number.isInteger(n) && n >= 0) ||
      !Number.isInteger(g.successes) ||
      g.successes < 0
    )
      return false;
    if (
      !validStrokes(g.strokes) ||
      !validStrokes(g.redo) ||
      (g.clearUndo != null && !validStrokes(g.clearUndo))
    )
      return false;
    if (
      !Array.isArray(g.history) ||
      g.history.length > g.schedule.length ||
      !g.history.every(
        (h) =>
          validWord(h.word) &&
          (h.artwork === undefined || validStrokes(h.artwork)) &&
          (h.canvasRatio === undefined || [1, 4 / 3].includes(h.canvasRatio)) &&
          typeof h.drawer === "string" &&
          (h.winner === null || typeof h.winner === "string") &&
          ["correct", "giveup", "timeout"].includes(h.type),
      )
    )
      return false;
    // Only new unique games use these invariants. Historical cyclic decks remain valid.
    if (g.settings.drawPolicy === "unique") {
      const positions = new Map(g.deck.map((w, i) => [w.id, i]));
      const sameWord = (a, b) =>
        a && b && a.id === b.id && a.en === b.en && a.zh === b.zh;
      let previous = -1;
      for (const h of g.history) {
        const position = positions.get(h.word.id);
        if (
          !Number.isInteger(position) ||
          position <= previous ||
          position >= g.deckPos ||
          !sameWord(h.word, g.deck[position])
        )
          return false;
        previous = position;
      }
      if (g.word !== null && !sameWord(g.word, g.deck[g.deckPos - 1]))
        return false;
      if (!g.finished) {
        if (g.history.length !== g.turn + (g.phase === "result" ? 1 : 0))
          return false;
        if (g.phase === "handoff") {
          if (g.word !== null || g.deckPos !== previous + 1) return false;
        } else if (g.phase === "result") {
          if (previous !== g.deckPos - 1) return false;
        } else if (previous >= g.deckPos - 1) return false;
      } else if (
        g.history.length > g.turn + 1 ||
        (g.word === null && g.deckPos !== previous + 1)
      )
        return false;
    }
    if (g.phase === "result") {
      const r = g.result;
      if (
        !r ||
        !["correct", "giveup", "timeout"].includes(r.type) ||
        !finite(r.msLeft) ||
        r.msLeft < 0 ||
        r.msLeft > g.timer.duration ||
        !g.history.length
      )
        return false;
      if (
        !Array.isArray(r.before?.scores) ||
        r.before.scores.length !== g.players.length ||
        !r.before.scores.every((n) => Number.isInteger(n) && n >= 0) ||
        !Array.isArray(r.before.teams) ||
        r.before.teams.length !== 2 ||
        !r.before.teams.every((n) => Number.isInteger(n) && n >= 0) ||
        !Number.isInteger(r.before.successes) ||
        r.before.successes < 0
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
