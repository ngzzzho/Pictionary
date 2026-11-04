import { validTeamNames } from "./team-names.mjs";
import { validLocale } from "./languages.mjs";
// Public TV data is constructed field by field. Never forward game/DOM snapshots.
const modes = new Set(["coop", "individual", "teams"]);
const reasons = new Set([
  "initializing",
  "off",
  "waiting",
  "connected",
  "captured",
  "background",
  "route",
  "reconnecting",
]);
const integer = (n, min, max) =>
  Number.isSafeInteger(n) && n >= min && n <= max;
const number = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const exact = (o, keys) =>
  o &&
  typeof o === "object" &&
  !Array.isArray(o) &&
  Object.keys(o).length === keys.length &&
  keys.every((k) => Object.hasOwn(o, k));
const frameKeys = [
  "v",
  "epoch",
  "seq",
  "round",
  "phase",
  "ratio",
  "seconds",
  "mode",
  "scores",
  "strokes",
  "language",
  "completedAnswer",
];

export function validTVFrame(f) {
  if (
    !exact(f, Object.hasOwn(f || {}, "teamNames") ? [...frameKeys, "teamNames"] : frameKeys) ||
    (f.teamNames !== undefined && (f.mode !== "teams" || !validTeamNames(f.teamNames))) ||
    f.v !== 2 ||
    !integer(f.epoch, 1, Number.MAX_SAFE_INTEGER) ||
    !integer(f.seq, 1, Number.MAX_SAFE_INTEGER) ||
    !integer(f.round, 0, Number.MAX_SAFE_INTEGER)
  )
    return false;
  if (
    !["waiting", "drawing", "result"].includes(f.phase) ||
    ![1, 4 / 3].includes(f.ratio) ||
    !integer(f.seconds, 0, 120) ||
    !modes.has(f.mode) ||
    !validLocale(f.language) ||
    typeof f.completedAnswer !== "string" || f.completedAnswer.length > 512 ||
    (f.phase !== "result" && f.completedAnswer !== "")
  )
    return false;
  if (
    !Array.isArray(f.scores) ||
    f.scores.length < 1 ||
    f.scores.length > 12 ||
    !f.scores.every((n) => integer(n, 0, 1000))
  )
    return false;
  if (
    (f.mode === "coop" && f.scores.length !== 1) ||
    (f.mode === "teams" && f.scores.length !== 2)
  )
    return false;
  if (
    !Array.isArray(f.strokes) ||
    f.strokes.length > 400 ||
    (f.phase === "waiting" && (f.strokes.length || f.seconds !== 0))
  )
    return false;
  let points = 0;
  for (const s of f.strokes) {
    if (
      !exact(s, ["color", "width", "points"]) ||
      typeof s.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !number(s.width, Number.MIN_VALUE, 24) ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      s.points.length > 2000
    )
      return false;
    points += s.points.length;
    if (
      points > 12000 ||
      !s.points.every(
        (p) =>
          Array.isArray(p) && p.length === 2 && p.every((n) => number(n, 0, 1)),
      )
    )
      return false;
  }
  return JSON.stringify(f).length <= 512000;
}

export function publicTVFrame({
  game,
  visible = false,
  strokes,
  remainingMs = 0,
  epoch,
  seq,
  round = 0,
  language = "en",
  completedAnswer = "",
}) {
  const mode = modes.has(game?.settings?.mode) ? game.settings.mode : "coop";
  const score = (n) => (integer(n, 0, 1000) ? n : 0);
  let scores =
    mode === "coop"
      ? [score(game?.successes)]
      : mode === "teams"
        ? [score(game?.teamScores?.[0]), score(game?.teamScores?.[1])]
        : (game?.players || []).slice(0, 12).map((p) => score(p.score));
  if (!scores.length) scores = [0];
  const phase =
    visible &&
    game?.settings?.surface === "canvas" &&
    ["drawing", "result"].includes(game?.phase)
      ? game.phase === "drawing"
        ? "drawing"
        : "result"
      : "waiting";
  const f = {
    v: 2,
    epoch,
    seq,
    round,
    phase,
    ratio: game?.canvasRatio === 1 ? 1 : 4 / 3,
    seconds:
      phase === "drawing" && Number.isFinite(remainingMs)
        ? Math.max(0, Math.min(120, Math.ceil(remainingMs / 1000)))
        : 0,
    mode,
    scores,
    strokes: [],
    language: validLocale(language) ? language : "en",
    completedAnswer: phase === "result" && game?.phase === "result" &&
      typeof completedAnswer === "string" && completedAnswer.length <= 512
      ? completedAnswer : "",
  };
  if (mode === "teams" && game?.settings?.teamNames && validTeamNames(game.settings.teamNames)) f.teamNames = [...game.settings.teamNames];
  if (phase !== "waiting") {
    const source = strokes || game?.strokes || [];
    // Reject oversized/invalid documents, rather than allocating arbitrary legacy data.
    if (!Array.isArray(source) || source.length > 400)
      return { ...f, phase: "waiting", completedAnswer: "", seconds: 0 };
    let count = 0;
    for (const s of source) {
      if (
        !Array.isArray(s?.points) ||
        s.points.length > 2000 ||
        (count += s.points.length) > 12000
      )
        return { ...f, phase: "waiting", completedAnswer: "", seconds: 0, strokes: [] };
      f.strokes.push({
        color: s.color,
        width: s.width,
        points: s.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [])),
      });
    }
  }
  if (!validTVFrame(f))
    return { ...f, phase: "waiting", completedAnswer: "", seconds: 0, strokes: [] };
  return f;
}

export function initialTVStatus(available = false) {
  return {
    available,
    enabled: false,
    connected: false,
    privateAllowed: !available,
    resetRequired: available,
    epoch: available ? 1 : 0,
    reason: available ? "initializing" : "off",
  };
}

// Initial handshakes must not turn optional TV play into an onboarding step.
// Actual capture/unknown routes still require explicit recovery.
export function requiresTVContinue(next, previous, hasPresentedPrivate) {
  if (!next.resetRequired && next.privateAllowed) return false;
  // Ordinary phone-only lifecycle uses the game's pause UI. Native still
  // covers private content until its route/handshake is safe again.
  if (!next.enabled && !previous.enabled &&
      ["background", "reconnecting"].includes(next.reason) &&
      ["off", "background", "reconnecting"].includes(previous.reason)) return false;
  return (
    next.enabled ||
    previous.enabled ||
    ["captured", "route"].includes(next.reason) ||
    (hasPresentedPrivate &&
      (previous.privateAllowed ||
        !["initializing", "off"].includes(next.reason)))
  );
}

export function createTVTransport({
  bridge,
  onStatus = () => {},
  target = globalThis.window,
  timeoutMs = 2500,
}) {
  let status = initialTVStatus(!!bridge),
    sequence = 0,
    busy = false,
    pendingFrame = null,
    stopped = false,
    timeoutGeneration = 0,
    seenStatus = false;
  function accept(value) {
    if (
      !value ||
      value.available !== true ||
      !["enabled", "connected", "privateAllowed", "resetRequired"].every(
        (k) => typeof value[k] === "boolean",
      ) ||
      !integer(value.epoch, 1, Number.MAX_SAFE_INTEGER) ||
      !reasons.has(value.reason)
    )
      return fail();
    if (value.epoch < status.epoch) return status;
    const next = Object.fromEntries(
      Object.keys(initialTVStatus(true)).map((k) => [k, value[k]]),
    );
    if (next.epoch !== status.epoch) sequence = 0;
    if (!seenStatus || JSON.stringify(next) !== JSON.stringify(status)) {
      const previous = status;
      status = next;
      seenStatus = true;
      onStatus(status, previous);
    }
    return status;
  }
  function fail() {
    if (!bridge || stopped) return status;
    const next = {
      ...status,
      privateAllowed: false,
      resetRequired: false,
      reason: "reconnecting",
    };
    if (JSON.stringify(next) !== JSON.stringify(status)) {
      const previous = status;
      status = next;
      onStatus(status, previous);
    }
    return status;
  }
  async function request(message) {
    if (!bridge || stopped) return status;
    let timer;
    const generation = timeoutGeneration;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => bridge.postMessage(message)),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("TV bridge timeout")),
            timeoutMs,
          );
        }),
      ]);
      if (!stopped && generation === timeoutGeneration) return accept(result);
      return status;
    } catch {
      timeoutGeneration++;
      return fail();
    } finally {
      clearTimeout(timer);
    }
  }
  const listener = (e) => accept(e.detail);
  target?.addEventListener("party-tv-status", listener);
  return {
    get status() {
      return status;
    },
    start: () => request({ action: "status" }),
    locale: (language) =>
      validLocale(language)
        ? request({ action: "locale", language })
        : Promise.resolve(status),
    refresh: () => request({ action: "status" }),
    enable: (enabled) => request({ action: "enable", enabled: !!enabled }),
    ack: (epoch) => request({ action: "ack", epoch }),
    async publish(makeFrame) {
      if (busy && !stopped) { pendingFrame = makeFrame; return; }
      if (
        stopped ||
        busy ||
        !status.enabled ||
        !status.connected ||
        !status.privateAllowed ||
        status.resetRequired
      )
        return;
      busy = true;
      try {
        const frame = makeFrame({ epoch: status.epoch, seq: ++sequence });
        if (!validTVFrame(frame)) {
          fail();
          return;
        }
        await request({ action: "frame", frame });
      } finally {
        busy = false;
        const next = pendingFrame; pendingFrame = null;
        if (next && !stopped) void this.publish(next);
      }
    },
    stop() {
      stopped = true;
      pendingFrame = null;
      target?.removeEventListener("party-tv-status", listener);
    },
  };
}
