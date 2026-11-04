import { teamGuessing } from "./team-guessing.mjs";
import { cleanTeamName, displayTeamName } from "./team-names.mjs";
import { gameStorageAdapter } from "./game-storage.mjs";
import { needsTopicReview } from "./decks.mjs";
import { freeDeck, freeSettings } from "./access.mjs";
import { createPurchases } from "./purchases.mjs";
import { purchaseText } from "./purchase-copy.mjs";
import {
  locales,
  selectableLocales,
  localeInfo,
  detectLocale,
  validLocale,
  cardLanguages,
  encodeCardLanguages,
} from "./languages.mjs";
import { localizedCopy, cardLines } from "./localization.mjs";
import { galleryView } from "./gallery.mjs";
import { backupView, backupMessage } from "./backup-ui.mjs";
import {
  RESTORE_MARKER,
  captureBackup,
  encodeBackup,
  decodeBackup,
  makeRestorePlan,
  applyRestore,
  recoverRestore,
  exportBackupFile,
} from "./backup.mjs";
import { defaults, validProfile } from "./profile.mjs";
import { uiIcon, topicGlyphs } from "./ui-icons.mjs";
import * as Game from "./core.mjs";
import {
  makeDeck,
  resolveTopic,
  selectedTopics,
  toggleTopic,
  resolveDifficulty,
  isPausedSelection,
  eligibleReplayDeck,
  topicChoices,
  difficultyKeys,
} from "./decks.mjs";
import { KEYS, storageAdapter, migrateLegacy } from "./storage.mjs";
import { translate } from "./i18n.mjs";
import { mountCanvas } from "./canvas.mjs";
import { exportArtwork } from "./artwork.mjs";
import { shareCardPNG, scoreCardPNG } from "./share-card.mjs";
import { penColors, extraPenNames, defaultBrush } from "./brush-preferences.mjs";
import { artworkArchive, artworkKey } from "./artwork-store.mjs";
import {
  createTVTransport,
  initialTVStatus,
  publicTVFrame,
  requiresTVContinue,
} from "./tv.mjs";
import { tvView, tvText } from "./tv-ui.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const purchases = createPurchases({
  bridge: window.webkit?.messageHandlers?.partyPurchase,
  onChange: (next, previous) => {
    if (!booted) return;
    const accessChanged = next.unlocked !== previous.unlocked;
    if (accessChanged) deckCache.clear();
    // Price/busy/result changes only affect the purchase screen. Keep the
    // current scene and its animations intact on redundant foreground checks.
    if (screen === "purchase" ||
        ((accessChanged || next.ready !== previous.ready) &&
         ["home", "setup", "settings", "words"].includes(screen))) render();
  },
});
const pt = (key) => purchaseText(profile.language, key);
let purchaseReturn = "home";
let purchaseStartup;
function openPurchase() {
  if (screen !== "purchase") purchaseReturn = screen;
  navigate("purchase");
  void Promise.resolve(purchaseStartup).then(() => purchases.products());
}
function purchaseEntry() {
  return `<button class="purchase-entry" data-action="purchase-menu">${esc(pt(purchases.state.unlocked ? "owned" : "unlock"))}</button>`;
}
function purchaseView() {
  const state = purchases.state;
  const total = content.words.filter((w) => w.review !== "held").length;
  const status = !state.ready
    ? "checking"
    : state.busy
      ? "working"
      : state.unlocked && ["ready", "owned"].includes(state.result)
        ? "owned"
        : state.result;
  const feedback = status !== "owned";
  const retry = ["failed", "unavailable", "notFound"].includes(status);
  return `${header(pt("title"), true, "purchase-back")}<section class="panel purchase-panel"><div class="purchase-overview"><h1>${esc(pt(state.unlocked ? "owned" : "title"))}</h1><p class="purchase-promise">${esc(pt("promise"))}</p><p>${esc(pt("features").replace("{count}", total))}</p></div>${feedback ? `<p class="purchase-status" role="status">${esc(pt(status))}</p>` : ""}<div class="purchase-actions">${state.unlocked ? "" : `<button class="btn primary" data-action="purchase-buy" ${state.busy || !state.ready || !state.available ? "disabled" : ""}><span>${esc(pt("unlock"))}${state.price ? ` · <bdi>${esc(state.price)}</bdi>` : ""}</span></button>`}<button class="btn secondary" data-action="purchase-restore" ${state.busy ? "disabled" : ""}><span>${esc(pt("restore"))}</span></button>${retry ? `<button class="btn secondary" data-action="purchase-refresh" ${state.busy ? "disabled" : ""}>${t("retry")}</button>` : ""}<button class="btn text" data-action="purchase-back">${t("back")}</button></div>${state.unlocked ? "" : `<p>${esc(pt("free"))}</p><p class="hint">${esc(pt("preserved"))}</p>`}</section>`;
}
const initialLocale = detectLocale(navigator.languages || [navigator.language]);
document.documentElement.lang = localeInfo(initialLocale).tag;
document.documentElement.dir = localeInfo(initialLocale).dir;
if ($(".boot-screen h1"))
  $(".boot-screen h1").textContent = translate(initialLocale, "brand");
if ($(".boot-screen p")) {
  $(".boot-screen p").textContent = translate(initialLocale, "loading");
  $(".boot-screen p").removeAttribute("aria-label");
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const drawingArchive = artworkArchive();
try {
  if (localStorage.getItem(RESTORE_MARKER))
    await recoverRestore(localStorage, drawingArchive);
} catch {
  $("#app").innerHTML =
    `<main class="load-error"><h1>${translate(detectLocale(navigator.languages), "recoveryTitle")}</h1><p>${translate(detectLocale(navigator.languages), "recoveryHint")}</p><button class="btn primary" onclick="location.reload()">${translate(detectLocale(navigator.languages), "retry")}</button></main>`;
  throw new Error("Restore recovery required before any game writes");
}
let profile,
  booted = false;
const issues = new Set();
const store = gameStorageAdapter(
  {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  },
  (key) => {
    issues.add(key);
    showNotice();
  },
);
profile = store.read(KEYS.profile, validProfile);
let g = store.read(KEYS.game, Game.validGame),
  last = store.read(KEYS.last, Game.validGame);
if (!profile) {
  const roster = store.read(
    "pp_roster",
    (v) =>
      Array.isArray(v) &&
      v.length <= 12 &&
      v.every(
        (p) =>
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          p.name.length <= 40,
      ),
  );
  const custom = store.read(
    "pp_custom_words",
    (v) =>
      Array.isArray(v) &&
      v.length <= 200 &&
      v.every((w) => typeof w === "string" && w.length <= 60),
  );
  profile = {
    version: 1,
    language: detectLocale(navigator.languages || [navigator.language]),
    muted: false,
    players: roster?.map((p, i) => ({ ...p, team: i % 2 })) || [],
    custom: custom || [],
    settings: {
      ...defaults,
      cardLanguage: [
        "pp_game",
        "pp_roster",
        "pp_settings",
        "pp_custom_words",
      ].some((key) => store.has(key))
        ? defaults.cardLanguage
        : initialLocale,
    },
    seenHelp: false,
  };
}
document.documentElement.lang = localeInfo(profile.language).tag;
document.documentElement.dir = localeInfo(profile.language).dir;
let content;
try {
  const response = await fetch("./js/content.json");
  if (!response.ok) throw new Error("content");
  content = await response.json();
} catch {
  $("#app").innerHTML =
    `<main class="load-error"><h1>${translate(profile.language, "loadFailed")}</h1><button class="btn primary" onclick="location.reload()">${translate(profile.language, "retry")}</button></main>`;
  throw new Error("Content unavailable");
}
const lookup = (text) => content.words.find((w) => w.en === text);
if (
  !store.has(KEYS.game) &&
  !store.has(KEYS.last) &&
  store.has("pp_game") &&
  !store.has(KEYS.profile)
) {
  g = migrateLegacy(store.read("pp_game"), lookup);
  if (g) {
    store.write(KEYS.game, g);
    issues.add("migrated");
  } else issues.add("invalidLegacy");
}
if (g) {
  Game.pause(g);
  if (g.phase === "drawing" && g.timer.msLeft <= 0) Game.end(g, "timeout");
}
let screen = "home",
  step = 0,
  error = "",
  scores = false,
  clearRequested = false,
  judging = false,
  palette = false,
  paletteResume = false,
  cover = false,
  canvasView = null,
  brush = defaultBrush();
const tvBridge = window.webkit?.messageHandlers?.partyTV;
let tv = null,
  tvStatus = initialTVStatus(!!tvBridge),
  tvContinueRequired = false,
  tvHasPresentedPrivate = false,
  tvExitPending = false,
  tvAckEpoch = 0,
  tvRoundKey = "",
  tvRound = 0,
  tvReturn = "home";
const tvGuarded = () =>
  tvStatus.available &&
  (!tvStatus.privateAllowed || tvStatus.resetRequired || tvContinueRequired);

function handleTVStatus(next, previous) {
  tvStatus = next;
  if (previous.enabled && !next.enabled && next.reason === "off")
    tvExitPending = true;
  if (["captured", "route", "background", "reconnecting"].includes(next.reason))
    tvExitPending = false;
  if (next.resetRequired || !next.privateAllowed) {
    if (requiresTVContinue(next, previous, tvHasPresentedPrivate))
      tvContinueRequired = true;
    peek(false);
    canvasView?.flush();
    if (g && !g.finished) {
      Game.pause(g);
      persist();
    }
    scores = false;
    clearRequested = false;
    judging = false;
    palette = false;
    paletteResume = false;
    const phoneLifecycle = !next.enabled && !previous.enabled &&
      ["background", "reconnecting"].includes(next.reason) &&
      ["off", "background", "reconnecting"].includes(previous.reason);
    if (!phoneLifecycle) artSelection = null;
    if (screen === "game") cover = g?.phase === "reveal";
  }
  if (next.privateAllowed && !next.resetRequired) tvHasPresentedPrivate = true;
  if (
    tvExitPending &&
    !next.enabled &&
    next.privateAllowed &&
    !next.resetRequired
  ) {
    tvExitPending = false;
    tvContinueRequired = false;
    screen = tvReturn;
  }
  render();
  acknowledgeTVStatus();
}
function acknowledgeTVStatus() {
  if (!tvStatus.resetRequired || tvAckEpoch === tvStatus.epoch) return;
  const epoch = tvStatus.epoch;
  tvAckEpoch = epoch;
  // A neutral document must paint before native may uncover it. A failed reply
  // is retryable on the next status check, even when native keeps the same epoch.
  requestAnimationFrame(() =>
    requestAnimationFrame(async () => {
      try {
        if (
          tvStatus.epoch === epoch &&
          tvStatus.resetRequired &&
          !document.hidden
        )
          await tv?.ack(epoch);
      } finally {
        if (tvAckEpoch === epoch) tvAckEpoch = 0;
      }
    }),
  );
}
async function refreshTV() {
  await tv?.refresh();
  acknowledgeTVStatus();
}

function publishTV() {
  if (
    !tvStatus.enabled ||
    !tvStatus.connected ||
    !tvStatus.privateAllowed ||
    document.hidden
  )
    return;
  const visible =
    !tvGuarded() &&
    !cover &&
    ["game", "final"].includes(screen) &&
    !showingLast;
  const key = visible && g ? `${g.id}:${g.turn}` : "";
  if (key && key !== tvRoundKey) {
    tvRoundKey = key;
    tvRound++;
  }
  void tv?.publish(({ epoch, seq }) =>
    publicTVFrame({
      game: visible ? g : null,
      visible,
      strokes: visible ? canvasView?.previewStrokes() || g?.strokes : [],
      remainingMs: visible && g ? Game.remaining(g) : 0,
      epoch,
      seq,
      round: tvRound,
      language: profile.language,
      completedAnswer: visible && screen === "game" && g?.phase === "result"
        ? cardText(g.word) : "",
    }),
  );
}
const archivePending = new Map();
let archivedSignature = "";
function archiveCurrentArtwork() {
  if (
    showingLast ||
    !g ||
    g.phase !== "result" ||
    g.settings.surface !== "canvas" ||
    !g.strokes.length
  )
    return;
  const key = artworkKey(g.id, g.turn + 1);
  const signature = key + JSON.stringify(g.strokes);
  if (signature === archivedSignature) return;
  archivedSignature = signature;
  const pending = drawingArchive
    .put(key, g.strokes, g.canvasRatio === 1 ? 1 : 4 / 3, {
      title: cardText(g.word),
      createdAt: g.createdAt || 0,
      round: g.turn + 1,
    })
    .then(() => {
      issues.delete("artworkStoreFailed");
      showNotice();
    })
    .catch(() => {
      archivedSignature = "";
      issues.add("artworkStoreFailed");
      showNotice();
    })
    .finally(() => {
      if (archivePending.get(key) === pending) archivePending.delete(key);
    });
  archivePending.set(key, pending);
}
let artPreview = "", artAnswer = false, artPreviewTicket = 0;
async function prepareArtPreview() {
  const item = artSelection, ticket = ++artPreviewTicket;
  artPreview = "";
  artBusy = true;
  render();
  try {
    const png = item.kind === "score" ? await scoreCardPNG(item.data) : await shareCardPNG(item.strokes, item.ratio, { answer: artAnswer ? item.title || "" : "", language: profile.language });
    if (ticket === artPreviewTicket && artSelection === item) artPreview = png;
  } catch { if (artSelection === item) artStatus = "artworkFailed"; }
  finally { if (ticket === artPreviewTicket && artSelection === item) { artBusy = false; render(); } }
}
let artSelection = null,
  artStatus = "",
  artBusy = false;
let showingLast = false,
  wake = null,
  audio = null,
  lastSecond = null;
const t = (key) => translate(profile.language, key);
const teamName = (team, settings = profile.settings) => displayTeamName(settings, team, t(team === 0 ? "teamA" : "teamB"));
function teamNameEditor(settings, scope = "profile") {
  return `<div class="team-name-editor">${[0,1].map(team => `<button class="btn secondary has-icon" data-action="rename-team" data-team-name="${team}" data-team-scope="${scope}" aria-label="${t(team === 0 ? "teamA" : "teamB")}: ${esc(teamName(team,settings))}">${iconFor("pencil")}<span>${esc(teamName(team, settings))}</span></button>`).join("")}</div>`;
}
function showNotice() {
  if (!booted) return;
  const box = $("#notices");
  if (box && profile)
    box.innerHTML = [...issues]
      .map((k) => `<p role="status">${esc(t(k))}</p>`)
      .join("");
}
function saveProfile() {
  if (localStorage.getItem(RESTORE_MARKER)) return;
  store.write(KEYS.profile, profile);
}
function persist() {
  if (localStorage.getItem(RESTORE_MARKER)) return;
  archiveCurrentArtwork();
  if (g && !g.finished && !showingLast)
    store.write(KEYS.game, Game.snapshot(g));
}
function updateWake() {
  const should = screen === "game" && g && !g.finished && !document.hidden;
  if (!should) {
    wake?.release().catch(() => {});
    wake = null;
    return;
  }
  if (!wake && "wakeLock" in navigator)
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        wake = lock;
        lock.addEventListener("release", () => {
          if (wake === lock) wake = null;
        });
        if (screen !== "game" || document.hidden) {
          lock.release();
          wake = null;
        }
      })
      .catch(() => {});
}
function feedback(kind) {
  if (profile.muted) return;
  window.webkit?.messageHandlers?.partyFeedback?.postMessage(kind);
}
function sound(kind) {
  feedback(kind);
  if (profile.muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const frequencies =
      kind === "complete"
        ? [523, 659, 784, 1047]
        : kind === "correct"
          ? [523, 659, 784]
          : kind === "timeout" || kind === "giveup"
            ? [196, 165]
            : [660, 880];
    frequencies.forEach((hz, i) => {
      const o = audio.createOscillator(),
        gain = audio.createGain(),
        now = audio.currentTime + i * 0.1;
      o.frequency.value = hz;
      o.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now);
      o.stop(now + 0.17);
    });
  } catch {}
}
const playlists = { starter: "easy" };
function topics() {
  return topicChoices(content, profile.custom.length > 0);
}
function topicName(key, compact = false) {
  if (typeof key !== "string") return t("mixed");
  if (key === "unavailable") return t("deckUnavailable");
  if (key.includes("+")) {
    const selected = selectedTopics(content, key);
    if (!selected.length) return t("deckUnavailable");
    if (compact)
      return t("topicSelectedSummary").replace("{count}", selected.length);
    return selected.map((topic) => topicName(topic)).join(" + ");
  }
  return key === "mixed"
    ? t("mixed")
    : key === "custom"
      ? t("words")
      : localizedCopy(profile.language, "topics")[key] || t("mixed");
}
function futureSettings(settings = profile.settings) {
  return {
    ...(purchases.state.unlocked
      ? settings
      : freeSettings(settings, profile.players)),
    topic: purchases.state.unlocked
      ? (needsTopicReview(settings.topic) ? "unavailable" : resolveTopic(content, settings.topic))
      : "mixed",
    difficulty: purchases.state.unlocked
      ? resolveDifficulty(settings.difficulty)
      : "general",
    drawPolicy: "unique",
  };
}
let deckCacheCustom = null;
const deckCache = new Map();
function deckFor(settings = profile.settings, includeCustom = true) {
  if (!purchases.state.unlocked) return freeDeck(content);
  if (needsTopicReview(settings.topic)) return [];
  // Subject counts recur across setup renders; translations are immutable.
  // A custom-word edit invalidates all cached pools before they are reused.
  const customKey = JSON.stringify(profile.custom);
  if (customKey !== deckCacheCustom) {
    deckCacheCustom = customKey;
    deckCache.clear();
  }
  const key = `${resolveTopic(content, settings.topic)}:${resolveDifficulty(settings.difficulty)}:${includeCustom}`;
  if (!deckCache.has(key))
    deckCache.set(
      key,
      makeDeck(content, profile.custom, settings, includeCustom, (word) =>
        locales.map(({ code }) => localizedCopy(code, "words")[word.id]),
      ),
    );
  return deckCache.get(key);
}
function plannedTurns(settings = profile.settings, players = profile.players) {
  return Game.scheduleFor(players, settings.mode, settings.roundsEach).length;
}
function poolRecovery(settings, deck) {
  const turns = plannedTurns(settings),
    required = Math.max(5, turns);
  return `<div class="pool-capacity" aria-live="polite"><p>${t("wordCount")} <strong>${deck.length}</strong></p><p>${t("total")} <strong>${turns}</strong></p><p>${t("spareCards")} <strong>${Math.max(0, deck.length - turns)}</strong></p></div>${deck.length < required ? `<div class="pool-recovery"><p role="status">${t("uniquePool")} ${t("needMoreTopics")}</p><div>${btn("addTopics", "add-topics", "secondary")}${btn("useAllLevels", "pool-recovery", "secondary", 'data-value="levels"')}${btn("useMixed", "pool-recovery", "secondary", 'data-value="mixed"')}${btn("fewerRounds", "pool-recovery", "secondary", 'data-value="rounds"')}</div></div>` : ""}`;
}
function deckChoice(key, settings, preset = false) {
  const subject = Object.hasOwn(content.topics, key);
  const candidate = {
    ...settings,
    topic: key,
    ...(preset ? { difficulty: playlists[key] } : {}),
  };
  const count = deckFor(candidate).length;
  const selected = subject
    ? selectedTopics(content, settings.topic).includes(key)
    : settings.topic === key &&
      (!preset || settings.difficulty === playlists[key]);
  const total = subject
    ? deckFor({ ...candidate, difficulty: "general" }).length
    : count;
  // Small subjects can be combined. Only Start checks the final union's capacity.
  return `<button class="topic ${preset ? "playlist" : "subject"} ${selected ? "selected" : ""}" data-action="${preset ? "playlist" : subject ? "topic-toggle" : "setting"}" ${preset ? "" : 'data-key="topic"'} data-value="${key}" aria-pressed="${selected}"><span>${iconFor("topic:" + key)}</span><strong>${esc(topicName(key))}</strong>${preset ? `<em>${t(key + "Hint")}</em>` : ""}<small>${count} ${t("wordCount")}${subject ? `<span class="topic-total">${t("allLevelCount").replace("{count}", total)}</span>` : ""}</small></button>`;
}
function deckPicker(settings, deck) {
  if (!purchases.state.unlocked)
    return `<div class="content-picker"><h1 class="section-title">${esc(pt("free"))}</h1><p>${esc(pt("limits"))}</p>${purchaseEntry()}<section class="setup-section"><h2>${t("cardLanguage")}</h2>${cardLanguagePicker()}</section><section class="setup-section capacity-section">${poolRecovery(settings, deck)}</section></div>`;
  const legacy = profile.settings.topic !== settings.topic;
  const paused = isPausedSelection(profile.settings);
  const hint =
    settings.topic === "custom"
      ? "customDifficultyHint"
      : settings.difficulty + "Hint";
  return `<div class="content-picker"><h1 class="sr-only">${t("playlists")}</h1><details class="subject-picker" data-disclosure="subjects"><summary><span class="subject-current-icon">${iconFor("topic:" + (settings.topic.includes("+") ? "mixed" : settings.topic))}</span><span><small>${t("topic")}</small><strong>${esc(topicName(settings.topic, true))}</strong></span><span class="subject-count">${deck.length}</span></summary><div class="subject-choices"><p class="topic-multi-hint">${t("topicsHint")}</p><div class="topic-grid playlist-grid">${Object.keys(
    playlists,
  )
    .map((key) => deckChoice(key, settings, true))
    .join(
      "",
    )}</div><h2>${t("chooseTopics")}</h2><div class="topic-grid subject-grid" role="group" aria-label="${t("chooseTopics")}">${topics()
    .map((key) => deckChoice(key, settings))
    .join(
      "",
    )}</div><div class="topics-done-row"><span role="status">${deck.length} ${t("wordCount")} · ${t(settings.difficulty)}</span>${btn("topicsDone", "topics-done", "secondary")}</div></div></details>${paused || legacy ? `<p class="legacy-theme" role="status">${t(needsTopicReview(profile.settings.topic) ? "retiredTopic" : paused ? "pausedDeck" : "legacyTheme")}</p>` : ""}<section class="setup-section"><h2>${t("difficulty")}</h2><div class="difficulty-options">${options("difficulty", difficultyKeys, settings)}</div><p class="deck-guidance">${t(hint)}</p>${profile.custom.length ? `<p class="hint">${t("customScopeHint")}</p>` : ""}</section><section class="setup-section"><h2>${t("cardLanguage")}</h2>${cardLanguagePicker()}</section><section class="setup-section capacity-section">${poolRecovery(settings, deck)}</section></div>`;
}
function cardText(w) {
  return cardLines(w, g?.settings.cardLanguage || profile.settings.cardLanguage)
    .map((line) => line.text)
    .join(" · ");
}
function wordLines(w, selection, labels = false) {
  return cardLines(w, selection)
    .map((line) => {
      const locale = localeInfo(line.code);
      return `<span class="card-line" lang="${line.code ? locale.tag : ""}" dir="${line.code ? locale.dir : "auto"}">${labels ? `<small>${esc(line.original ? t("originalWord") : locale.name)}</small>` : ""}<bdi>${esc(line.text)}</bdi>${line.original ? `<small class="original-note" lang="${localeInfo(profile.language).tag}" dir="${localeInfo(profile.language).dir}">${t(w.id?.startsWith("custom:") ? "customOriginal" : "wordUnavailable")}</small>` : ""}</span>`;
    })
    .join("");
}
function card(w) {
  return `<div class="word-card">${wordLines(w, g?.settings.cardLanguage || profile.settings.cardLanguage, false)}</div>`;
}
function languageOptions(selected, exclude = "") {
  return locales
    .filter((l) => l.code !== exclude && (!l.legacy || l.code === selected))
    .map(
      (l) =>
        `<option value="${l.code}" lang="${l.tag}" dir="${l.dir}" ${l.code === selected ? "selected" : ""}>${l.name}</option>`,
    )
    .join("");
}
function cardLanguagePicker() {
  const [first, second = ""] = cardLanguages(profile.settings.cardLanguage);
  const example =
    content.words.find((w) => w.id === "w:animals:dog") || content.words[0];
  return `<div class="card-language-picker" role="group" aria-label="${t("cardLanguageHint")}">${
    g && !g.finished
      ? `<p class="active-card-pair">${t("activeCardPair")}: <strong>${cardLanguages(
          g.settings.cardLanguage,
        )
          .map((code) => `<bdi>${localeInfo(code).name}</bdi>`)
          .join(" + ")}</strong></p>`
      : ""
  }<div class="language-fields"><label for="card-primary">${t("primaryLanguage")}<select id="card-primary">${languageOptions(first)}</select></label><label for="card-secondary">${t("secondaryLanguage")}<select id="card-secondary"><option value="" ${!second ? "selected" : ""}>${t("noSecondLanguage")}</option>${languageOptions(second, first)}</select></label></div><details class="card-preview-disclosure" data-disclosure="card-preview"><summary>${t("cardPreview")}</summary><div class="card-language-preview" aria-live="polite"><div class="word-card">${wordLines(example, profile.settings.cardLanguage, true)}</div></div><p class="hint unique-rule">${t("uniqueRule")}</p><p class="hint">${t("futureCards")}</p><p class="hint">${t("customOriginal")}</p></details></div>`;
}
function languagePicker() {
  return `<p class="hint">${t("interfaceLanguageHint")}</p><div class="language-grid" role="group" aria-label="${t("interfaceLanguage")}">${selectableLocales.map((l) => `<button class="option ${profile.language === l.code ? "selected" : ""}" data-action="language" data-value="${l.code}" lang="${l.tag}" dir="${l.dir}" aria-pressed="${profile.language === l.code}"><bdi>${l.name}</bdi><span aria-hidden="true">${profile.language === l.code ? "✓" : ""}</span></button>`).join("")}</div>`;
}
function languageView() {
  return `${header(t("interfaceLanguage"), true, "language-back")}<section class="panel"><h1>${t("chooseLanguage")}</h1>${languagePicker()}</section>${btn("back", "language-back", "primary")}`;
}
let languageReturn = "home";
const actionIcons = {
  quick: "play",
  "resume-game": "play",
  "toggle-pause": "play",
  "intro-start": "play",
  "start-game": "play",
  draw: "pencil",
  "next-round": "next",
  replay: "replay",
  setup: "teams",
  settings: "settings",
  "open-artwork": "photo",
  "save-artwork": "download",
  "share-artwork": "share",
  "prev-step": "back",
  "next-step": "next",
  "fix-setup": "settings",
  reveal: "peek",
  swap: "replay",
  judge: "check",
  "give-up": "next",
  "cancel-judge": "back",
  "close-palette": "check",
  undo: "undo",
  home: "home",
  backup: "download",
  reset: "clear",
  finish: "flag",
};
const btn = (key, action, cls = "secondary", extra = "") =>
  `<button class="btn ${cls}${actionIcons[action] ? " has-icon" : ""}" data-action="${action}" ${extra}>${actionIcons[action] ? iconFor(actionIcons[action]) : ""}<span>${esc(t(key))}</span></button>`;
// Functional symbols use one Picto family, tinted with the live label colour.
// Keep the old ItemIcon files for provenance and earlier local candidates.
const pictoAliases = {
  settings: "picto-settings",
  book: "picto-book",
  pencil: "picto-pencil",
  trophy: "picto-trophy",
  star: "picto-star",
  "icon-heart": "picto-heart",
  "icon-friends": "picto-friends",
  "icon-hourglass": "picto-hourglass",
  "icon-bulb": "picto-bulb",
  "icon-flag": "picto-flag",
  ...Object.fromEntries(
    ["food", "things", "cartoons", "nature", "festivals", "fairytales"].map(
      (topic) => [`icon-topic-${topic}`, `picto-topic-${topic}`],
    ),
  ),
};
const packIcon = (name, variant = "") => {
  const file = `assets/layerlab/${pictoAliases[name] || name}.png`;
  return `<i class="pack-icon ${variant}" data-asset="${file}" style="--picto:url('${new URL(file, document.baseURI).href}')" aria-hidden="true"><img src="${file}" alt="" draggable="false"></i>`;
};
const mascot = (pose) =>
  `<span class="mascot mascot-${pose}" aria-hidden="true"><img src="assets/characters/sketch-cat-${pose}-v1.png" width="1254" height="1254" alt="" draggable="false"></span>`;
const celebrationBurst = () =>
  `<span class="celebration-burst" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i style="--piece:${i}"></i>`).join("")}</span>`;
// One semantic mapping for the approved Simple Casual icon family. SVG remains an explicit fallback.
function iconFor(name) {
  // Original editing symbols: no corresponding eraser/undo/redo in the pack.
  const editing = {
    eraser:
      '<path d="m3.5 12.5 9-9a2.1 2.1 0 0 1 3 0l5 5a2.1 2.1 0 0 1 0 3L12 20H8l-4.5-4.5a2.1 2.1 0 0 1 0-3Z" fill="currentColor"/><path d="m6 13 4-4 6 6-3 3H10Z" fill="var(--symbol-cutout,#fff9e8)"/><path d="M14 21h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    undo: '<path d="M9 4 2 10l7 6v-4h5a4 4 0 0 1 0 8h-3v3h3a7 7 0 0 0 0-14H9Z" fill="currentColor"/>',
    redo: '<path d="m15 4 7 6-7 6v-4h-5a4 4 0 0 0 0 8h3v3h-3a7 7 0 0 1 0-14h5Z" fill="currentColor"/>',
  };
  if (editing[name])
    return `<svg class="tool-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${editing[name]}</svg>`;
  if (name === "next") return packIcon("icon-back", "point-forward");
  const assets = {
    back: "icon-back",
    home: "icon-home",
    add: "icon-add",
    download: "icon-download",
    share: "icon-share",
    photo: "icon-photo",
    close: "icon-close",
    undo: "icon-undo",
    redo: "icon-redo",
    clear: "icon-clear",
    heart: "icon-heart",
    flag: "icon-flag",
    teams: "icon-friends",
    replay: "icon-replay",
    star: "star",
    pause: "icon-pause",
    play: "icon-play",
    check: "icon-check",
    clock: "icon-hourglass",
    pencil: "pencil",
    bulb: "icon-bulb",
    palette: "icon-palette",
    peek: "icon-peek",
    settings: "settings",
    trophy: "trophy",
    book: "book",
    "sound-on": "sound-on",
    "sound-off": "sound-off",
  };
  if (name.startsWith("topic:")) {
    const raw = name.slice(6);
    if (raw === "equipment") return packIcon("icon-palette");
    const key =
      {
        home: "things",
        places: "things",
        science: "space",
        fantasy: "fairytales",
        celebrations: "festivals",
        starter: "mixed",
        silly: "actions",
        challenge: "space",
      }[raw] || raw;
    return key === "custom"
      ? packIcon("pencil")
      : topicGlyphs[key]
        ? packIcon(`icon-topic-${key}`)
        : uiIcon("star");
  }
  return assets[name] ? packIcon(assets[name]) : uiIcon(name);
}
const iconArtwork = (symbol, action) => {
  if (action === "language-menu") return uiIcon("language");
  if (action === "settings") return iconFor("settings");
  if (action === "sound")
    return iconFor(profile.muted ? "sound-off" : "sound-on");
  if (action === "scores" && symbol === "★") return iconFor("star");
  const glyph = {
    "←": "back",
    "×": "close",
    "↶": "undo",
    "↷": "redo",
    "⌫": "clear",
  }[symbol];
  return glyph ? iconFor(glyph) : symbol;
};
const toolCaptions = {
  "undo-stroke": "undoShort",
  "redo-stroke": "redoShort",
  "clear-canvas": "clearShort",
};
const icon = (symbol, label, action, disabled = false) =>
  `<button class="icon-btn" ${disabled ? "disabled" : ""} data-action="${action}" aria-label="${esc(t(label))}" title="${esc(t(label))}">${iconArtwork(symbol, action)}${toolCaptions[action] ? `<span class="tool-caption" aria-hidden="true">${t(toolCaptions[action])}</span>` : ""}</button>`;
const avatar = (p, i = 0) =>
  `<span class="avatar colour-${i % 6}" aria-hidden="true">${esc(p.name.trim().slice(0, 2))}</span>`;
function header(title = t("brand"), back = true, backAction = "home") {
  return `<header>${back ? icon("←", "back", backAction) : '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 240 220"><path d="M51 105 45 35 90 64 Q121 50 151 64 L199 35 187 111 Q205 167 154 184 Q75 209 51 153Z" fill="#ffdf95" stroke="#243450" stroke-width="7" stroke-linejoin="round"/><path d="M87 106v9m63-9v9m-38 12 10 9 10-9m-10 9v15m-23-2q23 20 46 0" fill="none" stroke="#243450" stroke-width="6" stroke-linecap="round"/></svg></span>'}<span class="header-title">${esc(title)}</span><div class="header-actions">${icon("文/A", "languageMenu", "language-menu")}${icon("⚙", "settings", "settings")}</div></header>`;
}
function home() {
  const active = g && !g.finished;
  const feature = (action, title, artwork) =>
    `<button class="feature feature-${action}" data-action="${action}"><span class="feature-icon">${packIcon(artwork)}</span><h2>${t(title)}</h2></button>`;
  return `<header class="lobby-header"><span class="lobby-label">${t("clubhouse")}</span><div class="header-actions"><button class="btn secondary tv-entry" data-action="tv" aria-label="${tvText(profile.language, "title")}">TV</button>${icon("文/A", "languageMenu", "language-menu")}</div></header><section class="hero"><div class="lobby-world"><div class="hero-copy"><h1 class="game-wordmark" aria-label="${t("brand")}"><span>${t("titleSketch")}</span><span>${t("titleGuess")}</span></h1><p class="hero-description">${t("tagline")}</p></div><div class="doodle">${mascot("welcome")}</div></div><div class="home-start"><p class="home-prompt">${t(active ? "homeSaved" : "lobbyInvite")}</p><div class="hero-actions">${active ? `<div class="home-route saved-route">${btn("resume", "resume-game", "primary")}<p>${g.players.length} ${t("players")} · ${t("round")} ${g.turn + 1}/${g.schedule.length}</p></div>` : ""}<div class="home-route">${btn("quick", "quick", active ? "secondary" : "primary")}<p>${purchases.state.unlocked ? t("quickRules").replace("{count}", Math.max(2, profile.players.length)) : esc(pt("free"))}</p></div><div class="home-route">${btn("customise", "setup", "secondary")}<p>${t("setupRouteHint")}</p></div>${btn("settings", "settings", "secondary home-settings")}${purchaseEntry()}</div></div></section><nav class="home-grid lobby-dock" aria-label="${t("morePlay")}">${feature("gallery", "myDrawings", "icon-photo")}${feature("how", "how", "book")}${feature("words", "words", "pencil")}${last ? feature("last", "last", "trophy") : ""}</nav>`;
}
function options(key, values, settings = profile.settings) {
  return `<div class="options">${values.map((value) => `<button class="option ${settings[key] === value ? "selected" : ""}" data-action="setting" data-key="${key}" data-value="${value}" aria-pressed="${settings[key] === value}">${esc(t(String(value)))}</button>`).join("")}</div>`;
}
// Reuse completed turns from the existing active/last save; no new player store.
function rotationSource() { return g?.history?.length ? g : last; }
function teamTurnPreview(settings) {
  if (settings.mode !== "teams" || Game.setupError(profile.players, settings, deckFor(settings))) return "";
  const schedule = Game.scheduleFor(profile.players, "teams", settings.roundsEach, rotationSource());
  return `<section class="team-turn-preview"><h2>${t("drawingTurns")}</h2><p class="hint">${t("teamBalance")}</p><ul>${profile.players.map((p,i)=>`<li><span>${esc(p.name)}</span><strong>${schedule.filter(n=>n===i).length}</strong></li>`).join("")}</ul></section>`;
}
let textEntryBusy = false;
async function requestTextEntry(title, value = "", limit = 20) {
  if (textEntryBusy || tvGuarded()) return null;
  textEntryBusy = true;
  const epoch = tvStatus.epoch;
  try {
    const bridge = window.webkit?.messageHandlers?.partyTextEntry;
    // Never fall back to blocking prompt inside an older native host.
    if (!bridge && window.webkit?.messageHandlers?.partyState) return null;
    const result = bridge ? await bridge.postMessage({ title, value, limit }) : { cancelled: false, value: window.prompt(title, value) };
    if (tvGuarded() || tvStatus.epoch !== epoch || localStorage.getItem(RESTORE_MARKER)) return null;
    return !result?.cancelled && typeof result?.value === "string" ? result.value : null;
  } catch { return null; }
  finally { textEntryBusy = false; }
}
// The iOS host installs partyState before loading the page. Use UIKit entry
// there; desktop/browser builds retain ordinary accessible HTML forms.
const nativeTextEntry = !!window.webkit?.messageHandlers?.partyState;
function entryForm(player) {
  const kind = player ? "player" : "word", id = `${kind}-input`;
  const label = t(player ? "playerName" : "customPlaceholder");
  if (nativeTextEntry) return `<div class="add-row"><button class="btn primary has-icon" data-action="add-text-entry" data-kind="${kind}">${iconFor("add")}<span>${label}</span></button></div>`;
  return `<form data-form="${kind}" class="add-row"><label class="sr-only" for="${id}">${label}</label><input id="${id}" placeholder="${label}" maxlength="${player ? 20 : 30}" autocomplete="off" required><button class="btn primary add-button" type="submit">${iconFor("add")}<span>${t("add")}</span></button></form>`;
}
function playerEditor() {
  return `<h1 class="section-title">${t("players")} <span class="muted">${profile.players.length}/12</span></h1>${!profile.players.length ? `<p class="muted roster-hint">${t("addPlayers")}</p>` : ""}${entryForm(true)}<div class="player-list">${profile.players.map((p, i) => `<div class="player-row">${avatar(p, i)}<span>${esc(p.name)}</span>${profile.settings.mode === "teams" ? `<button class="team-badge team-${p.team}" data-action="team" data-id="${p.id}" aria-label="${esc(p.name)}: ${esc(teamName(p.team))}. ${t("changeTeam")}">${esc(teamName(p.team))}</button>` : ""}<button class="remove" data-action="remove-player" data-id="${p.id}" aria-label="${t("remove")} ${esc(p.name)}">${iconFor("close")}</button></div>`).join("")}</div><h2>${t("mode")}</h2><div class="mode-grid">${["coop", "individual", "teams"].map((m, i) => `<button class="choice ${profile.settings.mode === m ? "selected" : ""}" data-action="setting" data-key="mode" data-value="${m}" aria-pressed="${profile.settings.mode === m}"><span class="choice-icon">${iconFor(["heart", "star", "teams"][i])}</span><strong>${t(m)}</strong></button>`).join("")}</div><p class="mode-explanation">${t(profile.settings.mode + "Hint")}</p>${profile.settings.mode === "teams" ? `<p class="muted">${t("teamBalance")}</p>${teamNameEditor(profile.settings)}<h2>${t("teamGuessingTitle")}</h2><div class="options team-guessing-options">${["own", "open"].map(value => `<button class="option ${teamGuessing(profile.settings) === value ? "selected" : ""}" data-action="setting" data-key="teamGuessing" data-value="${value}" aria-pressed="${teamGuessing(profile.settings) === value}">${t(value === "own" ? "teamGuessOwn" : "teamGuessOpen")}</button>`).join("")}</div><p class="hint">${t(teamGuessing(profile.settings) === "own" ? "teamGuessOwnHint" : "teamGuessOpenHint")}</p>` : ""}`;
}
const setupErrorStep = (code) =>
  ["deckCount", "uniquePool"].includes(code)
    ? 2
    : code === "invalidSettings"
      ? 1
      : 0;
function goSetupStep(target) {
  const draft = $("#player-input")?.value || "";
  const issue = Game.setupError(profile.players, futureSettings(), deckFor());
  const owner = setupErrorStep(issue);
  if (target > step && issue && owner < target) {
    step = owner;
    error = issue;
  } else {
    step = target;
    error = "";
  }
  render();
  window.scrollTo(0, 0);
  if (error && step === 0 && $("#player-input")) {
    $("#player-input").value = draft;
    $("#player-input").focus();
  }
}
function setup() {
  const s = futureSettings(),
    deck = deckFor(s),
    err = Game.setupError(profile.players, s, deck);
  const panels = [
    playerEditor(),
    `<h1 class="section-title">${t("surface")}</h1><div class="mode-grid two">${["canvas", "paper"].map((m, i) => `<button class="choice ${s.surface === m ? "selected" : ""}" data-action="setting" data-key="surface" data-value="${m}" aria-pressed="${s.surface === m}"><span class="choice-icon">${packIcon(i ? "book" : "pencil")}</span><strong>${t(m)}</strong><small>${t(m + "Hint")}</small></button>`).join("")}</div><h2>${t("seconds")}</h2>${options("seconds", [30, 60, 90, 120])}<h2>${t(s.mode === "teams" ? "teamRounds" : "rounds")}</h2>${options("roundsEach", purchases.state.unlocked ? [1, 2, 3, 5, 10] : [1, 2, 3, 5, 10].filter((n) => Game.scheduleFor(profile.players, s.mode, n).length * 2 <= 50), s)}${purchases.state.unlocked ? "" : `<p class="hint">${esc(pt("limits"))}</p>`}`,
    deckPicker(s, deck),
    `<div class="ready-icon setup-ready-character" aria-hidden="true">${mascot("welcome")}${packIcon("star")}</div><h1>${t(err ? "notReady" : "ready")}</h1><div class="ready-roster">${profile.players.map((p, i) => `<span>${avatar(p, i)} ${esc(p.name)}</span>`).join("")}</div><section class="ready-summary" aria-label="${t("setupTitle")}"><div class="summary-grid"><p>${t("players")}<strong>${profile.players.length}</strong></p><p>${t("mode")}<strong>${t(s.mode)}</strong></p><p>${t("surface")}<strong>${t(s.surface)}</strong></p><p>${t("seconds")}<strong>${s.seconds}</strong></p><p>${t("total")}<strong>${!err ? Game.scheduleFor(profile.players, s.mode, s.roundsEach).length : "—"}</strong></p><p>${t("wordCount")}<strong>${deck.length}</strong></p></div><div class="summary-detail"><span>${t("topic")}</span><strong>${esc(topicName(s.topic))}</strong></div><div class="summary-detail"><span>${t("cardLanguage")}</span><div class="summary-language-list">${cardLanguages(s.cardLanguage).map(c=>`<bdi>${localeInfo(c).name}</bdi>`).join("")}</div></div></section>${s.mode === "teams" ? `<p class="team-guessing-summary">${t("teamGuessingTitle")}: <strong>${t(teamGuessing(s) === "own" ? "teamGuessOwn" : "teamGuessOpen")}</strong></p>` : ""}${teamTurnPreview(s)}${s.surface === "paper" ? `<p class="hint">${t("paperNote")}</p>` : ""}${err ? poolRecovery(s, deck) : ""}${err ? `<p class="error" role="alert">${t(err)}</p>` : ""}`,
  ];
  return `${header(t("setupTitle"))}<nav class="steps" aria-label="${t("progress")}">${["stepPlayers", "stepGame", "stepDeck", "stepReady"].map((label, i) => `<button class="${step === i ? "active" : ""}" data-action="step" data-step="${i}" ${step === i ? 'aria-current="step"' : ""}><span class="step-number">${i + 1}</span><b class="step-label">${t(label)}</b></button>`).join("")}</nav><section class="panel setup-panel setup-step-${step}" data-scroll-key="setup">${panels[step]}${error ? `<p role="alert" class="error">${t(error)}</p>` : ""}</section><div class="bottom-actions">${btn("back", "prev-step")}${step === 3 ? (err ? btn("fixSetup", "fix-setup", "primary") : btn("startGame", "start-game", "primary")) : btn("next", "next-step", "primary")}</div>`;
}
function cooperationScore(game) {
  const total = game.finished ? game.history.length : game.schedule.length;
  return total ? `${game.successes} / ${total}` : String(game.successes);
}
function scoreboard(game) {
  if (game.settings.mode === "coop")
    return `<div class="cooperation"><span>${iconFor("heart")}</span><strong>${cooperationScore(game)}</strong><p>${t("together")}</p></div>`;
  const entries =
    game.settings.mode === "teams"
      ? [
          { id: "a", team: 0, name: teamName(0, game.settings), score: game.teamScores[0] },
          { id: "b", team: 1, name: teamName(1, game.settings), score: game.teamScores[1] },
        ]
      : [...game.players];
  const ordered = entries.sort((a, b) => b.score - a.score);
  return `<div class="score-list">${ordered.map((p, i) => `<div class="score-row" data-rank="${ordered.findIndex((x) => x.score === p.score) + 1}"><span class="rank">${ordered.findIndex((x) => x.score === p.score) + 1}</span>${avatar(p, i)}<span class="score-name" ${game.settings.mode === "teams" ? `data-team-label="${p.team}"` : ""}>${esc(p.name)}</span><strong>${p.score}</strong></div>`).join("")}</div>`;
}
function closePalette() {
  palette = false;
  if (paletteResume && !cover && g?.phase === "drawing") Game.resume(g);
  paletteResume = false;
}
function paletteSheet() {
  return `<dialog id="palette-dialog" class="modal palette-sheet" aria-labelledby="palette-title"><h2 id="palette-title">${t("palette")}</h2><p>${t("paletteHint")}</p><div class="canvas-tools"><div class="swatches" role="group" aria-label="${t("colour")}">${penColors.map((c, i) => `<button class="swatch ${brush.color === c && !brush.eraser ? "selected" : ""}" style="--swatch:${c}" data-action="colour" data-value="${c}" aria-label="${i < 6 ? t(["black", "red", "blue", "green", "yellow", "purple"][i]) : extraPenNames(profile.language)[i - 6]}" aria-pressed="${brush.color === c && !brush.eraser}"></button>`).join("")}</div><div class="tools">${[3, 7, 14].map((n, i) => `<button class="tool ${brush.width === n && !brush.eraser ? "selected" : ""}" data-action="brush" data-value="${n}" aria-pressed="${brush.width === n && !brush.eraser}" aria-label="${t("brush")} ${t(["brushSmall", "brushMedium", "brushLarge"][i])}"><span class="brush-sample" aria-hidden="true" style="width:${n + 3}px;height:${n + 3}px"></span><span class="tool-caption" aria-hidden="true">${t(["brushSmall", "brushMedium", "brushLarge"][i])}</span></button>`).join("")}<button class="tool ${brush.eraser ? "selected" : ""}" data-action="eraser" aria-pressed="${brush.eraser}" aria-label="${t("eraser")}">${iconFor("eraser")}<span class="tool-caption" aria-hidden="true">${t("eraseShort")}</span></button></div></div>${btn("doneTools", "close-palette", "primary")}</dialog>`;
}
function drawing() {
  const running = g.timer.running;
  return `<div class="play-layout ${g.settings.surface === "paper" ? "paper-layout" : ""}" style="--doc-ratio:${g.canvasRatio === 1 ? 1 : 4 / 3}"><section class="canvas-panel">${g.settings.surface === "canvas" ? `<div class="canvas-tools compact-tools"><button class="tool palette-button" data-action="palette" aria-label="${t("palette")}" aria-haspopup="dialog"><span class="palette-symbol">${iconFor("palette")}<span class="brush-dot" style="background:${brush.color}"></span></span><span class="tool-caption" aria-hidden="true">${t("colourShort")}</span></button><button class="tool ${brush.eraser ? "selected" : ""}" data-action="eraser" aria-pressed="${brush.eraser}" aria-label="${t("eraser")}">${iconFor("eraser")}<span class="tool-caption" aria-hidden="true">${t("eraseShort")}</span></button>${icon("↶", "undoStroke", "undo-stroke", !(g.strokes.length || g.clearUndo))}${icon("↷", "redoStroke", "redo-stroke", !g.redo.length)}${icon("⌫", "clear", "clear-canvas", !g.strokes.length)}</div><div class="canvas-wrap"><canvas id="drawing-canvas" role="img" aria-label="${t("drawingLabel")}"></canvas>${!running ? `<div class="pause-cover"><span>${iconFor("pause")}</span><h2>${t("paused")}</h2><p>${t("pausedHint")}</p>${btn("continue", "toggle-pause", "primary")}</div>` : ""}</div>` : `<div class="paper-stage"><span aria-hidden="true">${iconFor("pencil")}</span><h1>${t("paper")}</h1><p>${t("paperNote")}</p>${!running ? btn("continue", "toggle-pause", "primary") : ""}</div>`}</section><aside class="play-sidebar"><div class="timer ${running ? "" : "is-paused"}"><span>${t("seconds")}</span><button id="timer" data-action="toggle-pause" aria-label="${t(running ? "pause" : "continue")}"><strong id="t-num">${Math.ceil(Game.remaining(g) / 1000)}</strong><small>${t(running ? "pause" : "paused")}</small></button></div><div class="time-track"><div id="time-progress" role="progressbar" aria-label="${t("seconds")}" aria-valuemin="0" aria-valuemax="${g.timer.duration / 1000}" aria-valuenow="${Math.ceil(Game.remaining(g) / 1000)}"><span style="width:${(100 * Game.remaining(g)) / g.timer.duration}%"></span></div></div><button class="peek" id="peek" data-peek>${iconFor("peek")}<span>${t("peek")}</span></button>${btn("someoneGotIt", "judge", "primary success")}${btn("skipTurn", "give-up", "text")}</aside></div>`;
}
function judgementSheet() {
  return `<dialog id="judge-dialog" class="modal judgement-sheet" aria-labelledby="judge-title"><h2 id="judge-title">${t("guess")}</h2><p>${t("judgingHint")}</p><div class="guessers">${Game.eligible(
    g,
  )
    .map(
      (p, i) =>
        `<button class="guesser" data-action="correct" data-id="${p.id}">${avatar(p, i)}<span>${esc(p.name)}</span></button>`,
    )
    .join(
      "",
    )}</div>${btn("cancelJudgement", "cancel-judge", "secondary")}</dialog>`;
}
function roundScoreSummary() {
  if (g.result.type !== "correct") return t("noPoints");
  if (g.settings.mode === "coop") return t("coopPoint");
  if (g.settings.mode === "teams") return `${teamName(g.players.find(p => p.id === g.result.winnerId)?.team ?? Game.drawer(g).team, g.settings)} +1`;
  const winner = g.players.find((p) => p.id === g.result.winnerId);
  return `${Game.drawer(g).name} +1 · ${winner?.name || ""} +1`;
}
function gameView() {
  const d = Game.drawer(g);
  let body = "";
  if (g.phase === "handoff")
    body = `<section class="stage handoff-stage"><div class="handoff-identity">${mascot("secret")}<div class="handoff-avatar">${avatar(d, g.schedule[g.turn])}</div></div><p class="eyebrow">${t("pass")}</p><h1>${esc(d.name)}</h1>${g.settings.mode === "teams" ? `<p><span class="team-chip team-${d.team}">${esc(teamName(d.team, g.settings))}</span></p>` : ""}<p class="muted">${t("secret")}</p>${btn("reveal", "reveal", "primary")}${g.settings.drawPolicy !== "unique" ? `<p class="legacy-repeat">${t("legacyRepeat")}</p>` : ""}</section>`;
  if (g.phase === "reveal")
    body = `<section class="stage reveal-stage"><h1 class="eyebrow">${esc(d.name)} · ${t("yourWord")}</h1><div class="secret-ticket"><span class="ticket-icon" aria-hidden="true">${packIcon("pencil")}</span>${card(g.word)}</div><p class="muted">${t("secret")}</p>${btn("draw", "draw", "primary success")}${g.swapUsed ? `<p class="muted">${t("swapped")}</p>${g.swapOriginal ? btn("returnOriginal", "return-original", "secondary") : ""}` : `${btn("swap", "swap", "text", Game.canSwap(g) ? "" : "disabled")}${!Game.canSwap(g) ? `<p class="swap-reserved" role="status">${t("swapReserved")}</p>` : ""}`}</section>`;
  if (g.phase === "drawing") body = drawing();
  if (g.phase === "result")
    body = `<section class="stage result-stage result-${g.result.type}"><div class="result-heading"><div class="ready-icon result-emblem ${g.result.type === "correct" ? "has-mascot" : ""}" aria-hidden="true">${g.result.type === "correct" ? mascot("celebrate") + celebrationBurst() : ""}${iconFor(g.result.type === "correct" ? "check" : g.result.type === "timeout" ? "clock" : "bulb")}</div><h1>${t(g.result.type === "correct" ? "correct" : g.result.type === "timeout" ? "timeout" : "skipped")}</h1></div><div class="result-moment"><div class="result-answer"><p>${t("answer")}</p>${card(g.word)}</div>${artwork(g.strokes, g.canvasRatio === 1 ? 1 : 4 / 3)}</div><p class="score-gain">${esc(roundScoreSummary())}</p>${g.turn + 1 < g.schedule.length ? `<p class="next-drawer">${t("nextDrawer")}: <strong>${esc(g.players[g.schedule[g.turn + 1]].name)}</strong></p>` : ""}<div class="result-actions">${btn(g.turn + 1 === g.schedule.length ? "final" : "nextRound", "next-round", "primary")}${btn("undo", "undo", "text")}${g.settings.surface === "canvas" && g.strokes.length ? btn("keepArtwork", "open-artwork", "secondary", 'data-index="current"') : ""}</div></section><details class="panel score-details"><summary>${t("score")}</summary>${scoreboard(g)}</details>`;
  return `<header>${icon("←", "exit", "exit")}<span class="header-title round-ribbon" role="heading" aria-level="1">${t("round")} ${g.turn + 1} / ${g.schedule.length}</span><div class="header-actions">${icon("★", "score", "scores")}${icon(profile.muted ? "♩" : "♪", "sound", "sound")}</div></header><div class="play-caption"><span>${esc(d.name)} ${t("drawing")}</span><span>${g.settings.mode === "teams" ? esc(teamName(d.team, g.settings)) : esc(topicName(g.settings.topic, true))}</span></div>${body}<div class="end-action">${btn("finish", "finish", "text")}</div>${scores ? `<div class="modal-backdrop"><dialog id="scores-dialog" class="modal" aria-label="${t("score")}"><div class="modal-heading"><h2>${t("score")}</h2>${icon("×", "back", "scores")}</div>${scoreboard(g)}${g.settings.mode === "teams" ? teamNameEditor(g.settings, "game") : ""}</dialog></div>` : ""}${palette ? paletteSheet() : ""}${judging ? judgementSheet() : ""}${clearRequested ? `<dialog id="clear-dialog" class="modal"><h2>${t("clearConfirm")}</h2>${btn("clear", "confirm-clear", "primary")}${btn("cancelJudgement", "cancel-clear", "secondary")}</dialog>` : ""}${cover ? `<div class="privacy-cover" role="dialog" aria-modal="true" aria-labelledby="privacy-title"><h1 id="privacy-title">${t("paused")}</h1><p>${t("screenHidden")}</p>${btn("resume", "uncover", "primary")}</div>` : ""}`;
}
function strokePath(points, height) {
  let path = `M${points[0][0] * 800} ${points[0][1] * height}`;
  for (let i = 1; i < points.length - 1; i++) {
    path += ` Q${points[i][0] * 800} ${points[i][1] * height} ${(points[i][0] + points[i + 1][0]) * 400} ${((points[i][1] + points[i + 1][1]) * height) / 2}`;
  }
  return path + ` L${points.at(-1)[0] * 800} ${points.at(-1)[1] * height}`;
}
function artworkSheet() {
  return `<div class="modal-backdrop"><dialog id="artwork-dialog" class="modal artwork-sheet" aria-labelledby="artwork-title"><div class="modal-heading"><h2 id="artwork-title">${t(artSelection.kind === "score" ? "score" : "yourDrawing")}</h2>${icon("×", "back", "close-artwork", artBusy)}</div>${artPreview ? `<img class="share-card-preview" src="${artPreview}" alt="${t(artSelection.kind === "score" ? "score" : "yourDrawing")}">` : `<p role="status">${t("artworkWorking")}</p>`}${artSelection.kind === "score" ? "" : `<label class="share-answer"><input type="checkbox" data-share-answer ${artAnswer ? "checked" : ""} ${artBusy || !artSelection.title ? "disabled" : ""}>${t("answer")}</label>`}${artSelection.previewOnly ? `<p>${t("artworkPreviewOnly")}</p>` : ""}<div class="artwork-actions">${btn("saveArtwork", "save-artwork", "primary", artBusy || !artPreview ? "disabled" : "")}${btn("shareArtwork", "share-artwork", "secondary", artBusy || !artPreview ? "disabled" : "")}</div><p class="artwork-status" role="status" aria-live="polite">${artStatus ? t(artStatus) : ""}</p></dialog></div>`;
}
function artwork(strokes, ratio = 1) {
  if (!strokes?.length) return "";
  const height = 800 / ratio;
  return `<div class="artwork-frame"><svg class="artwork-preview" viewBox="0 0 800 ${height}" role="img" aria-label="${t("drawingLabel")}"><rect width="800" height="${height}" fill="white"/>${strokes.map((s) => (s.points.length === 1 ? `<circle cx="${s.points[0][0] * 800}" cy="${s.points[0][1] * height}" r="${s.width / 2}" fill="${esc(s.color)}"/>` : `<path d="${strokePath(s.points, height)}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`)).join("")}</svg></div>`;
}
// Ties name up to three winners; longer lists fall back to a count rather than a wall of names.
function winnerLine(winners) {
  const names = winners.map((w) => w.name);
  return names.length <= 3 && names.join("").length <= 36
    ? esc(names.join(" · "))
    : `${names.length} ${t("winners")}`;
}
function finalView() {
  const entries =
    g.settings.mode === "teams"
      ? g.teamScores.map((score, team) => ({ score, name: teamName(team, g.settings) }))
      : g.players;
  const high = Math.max(...entries.map((p) => p.score));
  const winners = entries.filter((p) => p.score === high);
  return `${header(t("final"))}<section class="celebration"><div class="ready-icon final-character" aria-hidden="true">${mascot(g.successes > 0 ? "celebrate" : "welcome")}${packIcon("trophy")}${celebrationBurst()}</div><h1>${g.settings.mode === "coop" ? cooperationScore(g) : high === 0 ? t("noWinner") : winners.length > 1 ? t("tie") : esc(winners[0].name)}</h1><p>${g.settings.mode === "coop" ? t("together") : high === 0 ? "" : winners.length > 1 ? winnerLine(winners) : t("winner")}</p></section><div class="replay-actions">${btn("shareScore", "open-scorecard", "secondary")}${g.history.some(h => h.artwork?.length) ? btn("keepArtwork", "open-artwork", "secondary", `data-index="${g.history.findLastIndex(h => h.artwork?.length)}"`) : ""}${btn("replay", "replay", "primary")}<p>${t("replayHint")}</p>${btn("home", "home", "text")}</div>${g.settings.mode !== "coop" ? `<section class="panel final-scores"><h2>${t("score")}</h2>${scoreboard(g)}</section>` : ""}<section class="panel recap-panel"><h2>${t("recap")}</h2><div class="recap-grid">${g.history.length ? g.history.map((h, index) => `<div class="recap-row"><span>${h.round}</span><div><strong>${esc(cardText(h.word))}</strong>${artwork(h.artwork, h.canvasRatio || 4 / 3)}${h.artwork?.length ? btn("keepArtwork", "open-artwork", "secondary", `data-index="${index}"`) : ""}<small>${esc(h.drawer)} → ${h.winner ? esc(h.winner) : t(h.type === "timeout" ? "timeout" : "skipped")}</small></div><span class="recap-mark ${h.type}">${iconFor(h.type === "correct" ? "check" : "close")}</span></div>`).join("") : `<p>${t("emptyRecap")}</p>`}</div></section>`;
}
function wordsView() {
  if (!purchases.state.unlocked)
    return `${header(t("words"))}<section class="panel"><h1>${t("words")}</h1><p>${esc(pt("preserved"))}</p>${purchaseEntry()}<div class="word-chips">${profile.custom.map((word) => `<span>${esc(word)}</span>`).join("")}</div></section>`;
  return `${header(t("words"))}<section class="panel"><h1>${t("words")}</h1><p class="muted">${t("customHint")}</p>${entryForm(false)}${error ? `<p class="error" role="alert">${t(error)}</p>` : ""}${!profile.custom.length ? `<p class="empty-state">${t("noCustom")}</p>` : ""}<div class="word-chips">${profile.custom.map((word, i) => `<span>${esc(word)}<button data-action="remove-word" data-index="${i}" aria-label="${t("remove")} ${esc(word)}">${iconFor("close")}</button></span>`).join("")}</div><p class="muted">${profile.custom.length} / 200 · ${t("saveHint")}</p></section>`;
}
function settingsView() {
  return `${header(t("settings"))}<section class="panel"><h1>${t("preferences")}</h1>${purchaseEntry()}<button class="settings-language-row" data-action="language-menu"><span>${t("interfaceLanguage")}</span><strong><bdi>${localeInfo(profile.language).name}</bdi>${uiIcon("language")}</strong></button><h2>${t("cardLanguage")}</h2>${cardLanguagePicker()}<div class="settings-sound-row"><h2>${t("sound")}</h2><button class="btn secondary feedback-switch" data-action="sound" role="switch" aria-checked="${!profile.muted}" aria-label="${t("sound")}"><span aria-hidden="true"></span>${t(profile.muted ? "off" : "on")}</button></div><div class="settings-actions"><button class="btn secondary" data-action="tv">${tvText(profile.language, "title")}</button>${btn("backup", "backup")}</div><details class="settings-data" data-disclosure="data"><summary>${t("clearData")}</summary><p class="hint">${t("privacy")}</p>${btn("clearData", "reset", "danger")}</details></section>`;
}
function introView() {
  return `<section class="panel intro-panel"><p class="eyebrow">${t("brand")}</p><h1>${t("introTitle")}</h1><ol class="intro-steps">${["book", "pencil", "star"].map((name, i) => `<li>${packIcon(name)}<div><h2>${t("introHeading" + (i + 1))}</h2><p>${t("introBody" + (i + 1))}</p></div></li>`).join("")}</ol>${btn("introStart", "intro-start", "primary success")}</section>`;
}
function howView() {
  return `${header(t("how"))}<section class="panel"><p class="eyebrow">${t("localOnly")}</p><h1>${t("tutorialTitle")}</h1><ol class="how-list">${[1, 2, 3, 4, 5].map((i) => `<li><span>${i}</span><p>${t("how" + i)}</p></li>`).join("")}</ol><p class="hint">${t("paperNote")}</p>${btn("howButton", "setup", "primary")}</section>`;
}
function refreshToolbar() {
  const disabled = {
    "undo-stroke": !(g.strokes.length || g.clearUndo),
    "redo-stroke": !g.redo.length,
    "clear-canvas": !g.strokes.length,
  };
  for (const [action, state] of Object.entries(disabled)) {
    document.querySelectorAll(`[data-action="${action}"]`).forEach((button) => {
      button.disabled = state;
    });
  }
}
let renderedPhase = "";
let forwardObserver;
function fitForwardAction() {
  forwardObserver?.disconnect();
  const shell = $(".screen-game, .screen-setup, .screen-intro, .screen-tv, .screen-tv-safe");
  const button = shell?.querySelector('.tv-actions, .bottom-actions, [data-action="intro-start"], [data-action="reveal"], [data-action="draw"], [data-action="next-round"]');
  if (!button) return;
  const update = () => shell.style.setProperty("--forward-height", `${Math.ceil(button.getBoundingClientRect().height)}px`);
  update();
  forwardObserver = new ResizeObserver(update);
  forwardObserver.observe(button);
}
let renderedDialog = "";
let renderedCover = false;
let dialogReturnFocus = "";
const formDrafts = new Map();
function focusSelector(element) {
  if (!element || !element.closest("#app")) return "";
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.tagName === "SUMMARY" && element.parentElement.dataset.disclosure)
    return `[data-disclosure="${CSS.escape(element.parentElement.dataset.disclosure)}"] > summary`;
  if (!element.dataset.action) return "";
  const dialog = element.closest("dialog");
  return (
    (dialog ? `#${CSS.escape(dialog.id)} ` : "") +
    ["action", "key", "value", "id", "index", "step"]
      .filter((key) => element.dataset[key] !== undefined)
      .map((key) => `[data-${key}="${CSS.escape(element.dataset[key])}"]`)
      .join("")
  );
}
function render({ clearDraft = null, closeDisclosure = null } = {}) {
  forwardObserver?.disconnect();
  const phase = `${screen}:${screen === "game" ? g.phase + ":" + g.turn : screen === "setup" ? step : ""}`;
  const sameView = phase === renderedPhase && !tvGuarded();
  const position = { x: scrollX, y: scrollY };
  const scrolls = [
    ...document.querySelectorAll("[data-scroll-key], dialog[id]"),
  ].map((node) => ({
    selector: node.id
      ? `#${CSS.escape(node.id)}`
      : `[data-scroll-key="${CSS.escape(node.dataset.scrollKey)}"]`,
    top: node.scrollTop,
    left: node.scrollLeft,
  }));
  const disclosures = new Map(
    [...document.querySelectorAll("details[data-disclosure]")].map((node) => [
      node.dataset.disclosure,
      node.open,
    ]),
  );
  archiveCurrentArtwork();
  const active = document.activeElement;
  const previousFocus = focusSelector(active);
  const selection =
    active?.tagName === "INPUT"
      ? [active.selectionStart, active.selectionEnd]
      : null;
  for (const input of document.querySelectorAll("#player-input, #word-input"))
    formDrafts.set(input.id, input.value);
  if (clearDraft) formDrafts.set(clearDraft, "");
  booted = true;
  canvasView?.destroy();
  canvasView = null;
  document.documentElement.lang = localeInfo(profile.language).tag;
  document.documentElement.dir = localeInfo(profile.language).dir;
  document.title = t("brand");
  document.body.classList.toggle(
    "drawing-active",
    !tvGuarded() && screen === "game" && g.phase === "drawing",
  );
  if (tvGuarded()) {
    $("#app").innerHTML =
      `<main class="shell screen-tv-safe">${tvView(tvStatus, profile.language, { guarded: true, continueRequired: tvContinueRequired, startup: !tvHasPresentedPrivate && !tvContinueRequired && !tvStatus.enabled })}</main>`;
    fitForwardAction();
    updateWake();
    return;
  }
  $("#app").innerHTML =
    `<main data-scroll-key="screen-${screen}" class="shell screen-${screen} ${screen === "game" ? "playing phase-" + g.phase : ""}">${{ home, purchase: purchaseView, languages: languageView, intro: introView, setup, game: gameView, final: finalView, words: wordsView, settings: settingsView, how: howView, tv: () => tvView(tvStatus, profile.language), gallery: () => galleryView({ ...galleryState, language: profile.language, icon: iconFor }), backup: () => backupView(backupState, profile.language) }[screen]()}${artSelection ? artworkSheet() : ""}</main>`;
  for (const node of document.querySelectorAll("details[data-disclosure]")) {
    if (sameView && disclosures.has(node.dataset.disclosure))
      node.open = disclosures.get(node.dataset.disclosure);
    if (node.dataset.disclosure === closeDisclosure) node.open = false;
  }
  const phaseChanged = phase !== renderedPhase;
  for (const input of document.querySelectorAll("#player-input, #word-input"))
    input.value = formDrafts.get(input.id) || "";
  // Celebrate a newly earned result, never a restored save or a view of history.
  const earnedResult =
    screen === "game" &&
    g.phase === "result" &&
    g.result.type === "correct" &&
    renderedPhase === `game:drawing:${g.turn}`;
  const completedGame =
    screen === "final" && renderedPhase.startsWith("game:") && g.successes > 0;
  if (earnedResult || completedGame)
    $(".shell").classList.add("celebrate-enter");
  if (phaseChanged) {
    $(".shell").classList.add("screen-enter");
    renderedPhase = phase;
  }
  for (const image of document.querySelectorAll(".mascot img")) {
    const ready = () => image.parentElement?.classList.add("character-ready");
    if (image.complete && image.naturalWidth) ready();
    else image.addEventListener("load", ready, { once: true });
  }
  if ($("#drawing-canvas"))
    canvasView = mountCanvas(
      $("#drawing-canvas"),
      g,
      brush,
      () => {
        persist();
        refreshToolbar();
      },
      () => {
        error = "canvasLimit";
        issues.add(error);
        showNotice();
      },
    );
  const dialog =
    $("#clear-dialog") ||
    $("#artwork-dialog") ||
    $("#palette-dialog") ||
    $("#judge-dialog") ||
    $("#scores-dialog");
  if (dialog) {
    dialog.showModal();
    if (dialog.id !== renderedDialog) {
      dialog.classList.add("dialog-enter");
      dialogReturnFocus = previousFocus;
    }
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (artBusy) return;
      clearRequested = false;
      artSelection = null;
      scores = false;
      judging = false;
      if (palette) closePalette();
      persist();
      render();
    });
  }
  const privacy = $(".privacy-cover");
  if (privacy) {
    for (const child of $(".shell").children)
      if (child !== privacy) child.inert = true;
  }
  // Rebuilding the DOM must not send keyboard/VoiceOver users back to the
  // document start, reopen a software keyboard on navigation, or lose a draft.
  let focusTarget = null;
  if (privacy) focusTarget = $("#privacy-title");
  else if (dialog)
    focusTarget =
      dialog.id === renderedDialog && previousFocus
        ? $(previousFocus)
        : dialog.querySelector("h2");
  else if (phaseChanged || renderedCover)
    focusTarget = $(".shell h1") || $(".header-title");
  else if (renderedDialog && dialogReturnFocus)
    focusTarget = $(dialogReturnFocus);
  else if (closeDisclosure)
    focusTarget = $(
      `[data-disclosure="${CSS.escape(closeDisclosure)}"] > summary`,
    );
  else if (previousFocus) focusTarget = $(previousFocus);
  if (!focusTarget && previousFocus.includes('data-action="gallery-favourite"'))
    focusTarget = $('[data-action="gallery-filter"][aria-pressed="true"]');
  if (focusTarget?.closest("details:not([open])"))
    focusTarget = focusTarget.closest("details").querySelector("summary");
  if (focusTarget) {
    if (!focusTarget.matches("button,input,a,select,textarea,summary"))
      focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
    if (selection && focusTarget.id === active.id && !clearDraft)
      focusTarget.setSelectionRange(...selection);
  }
  if (!dialog) dialogReturnFocus = "";
  renderedCover = !!privacy;
  renderedDialog = dialog?.id || "";
  showNotice();
  fitForwardAction();
  if (sameView) {
    for (const saved of scrolls) {
      const node = $(saved.selector);
      if (node) {
        node.scrollTop =
          closeDisclosure === "subjects" && node.dataset.scrollKey === "setup"
            ? 0
            : saved.top;
        node.scrollLeft = saved.left;
      }
    }
    window.scrollTo(position.x, position.y);
  }
  updateWake();
  publishTV();
  window.webkit?.messageHandlers?.partyState?.postMessage({
    playing: screen === "game",
  });
}
function navigate(to) {
  artSelection = null;
  if (screen === "game" && g) {
    canvasView?.flush();
    Game.pause(g);
    persist();
  }
  if (showingLast) {
    g = store.read(KEYS.game, Game.validGame);
    showingLast = false;
  }
  screen = to;
  scores = false;
  judging = false;
  palette = false;
  paletteResume = false;
  cover = false;
  error = "";
  render();
  window.scrollTo(0, 0);
}
function startNew(
  players = profile.players,
  settings = profile.settings,
  deck = deckFor(),
  allowFreePending = false,
) {
  if (!purchases.state.ready && !allowFreePending) {
    error = "purchaseChecking";
    render();
    return;
  }
  if (purchases.state.unlocked && needsTopicReview(settings.topic)) {
    screen = "setup"; step = 2; error = "retiredTopic"; render(); return;
  }
  const nextSettings = purchases.state.unlocked
    ? futureSettings(settings)
    : freeSettings(settings, players);
  if (!purchases.state.unlocked) deck = freeDeck(content);
  const err = Game.setupError(players, nextSettings, deck);
  if (err) {
    error = err;
    screen = "setup";
    step = setupErrorStep(err);
    render();
    return;
  }
  if (g && !g.finished && !confirm(t("newConfirm"))) return;
  brush.eraser = false;
  g = Game.newGame(players, nextSettings, deck, Date.now(), rotationSource());
  saveProfile();
  persist();
  screen = profile.onboardingSeen ? "game" : "intro";
  showingLast = false;
  render();
  window.scrollTo(0, 0);
}
function finishSave() {
  if (!g?.finished) return;
  last = Game.snapshot(g);
  if (store.write(KEYS.last, last)) store.remove(KEYS.game);
  else store.write(KEYS.game, last);
  screen = "final";
  sound("complete");
  render();
  window.scrollTo(0, 0);
}
function hide() {
  clearRequested = false;
  judging = false;
  palette = false;
  paletteResume = false;
  if (screen !== "game" || !g || g.finished) return;
  canvasView?.flush();
  Game.pause(g);
  persist();
  // A completed drawing is public. Keep its sheet usable across the Photos/share prompt.
  // Native app-switcher masking still comes from SceneDelegate.
  if (artSelection && g.phase === "result") return;
  // Drawing already has one explicit pause/resume surface. A second privacy
  // Continue would merely reveal another Continue. Answers still need a cover.
  cover = g.phase === "reveal";
  scores = false;
  render();
}
function peek(on) {
  const button = $("#peek");
  if (button) {
    button.querySelector("span").innerHTML =
      on && !cover && !tvGuarded()
        ? wordLines(g.word, g.settings.cardLanguage)
        : esc(t("peek"));
    button.classList.toggle("is-peeking", on && !cover && !tvGuarded());
  }
}
function updateSetting(key, value) {
  if (!Object.hasOwn(defaults, key) && key !== "teamGuessing") return;
  if (key === "teamGuessing" && !["own", "open"].includes(value)) return;
  if (["seconds", "roundsEach"].includes(key)) value = Number(value);
  profile.settings[key] = value;
  if (key === "mode" && value === "coop") profile.settings.roundsEach = 3;
  error = "";
  saveProfile();
  render({ closeDisclosure: key === "topic" ? "subjects" : null });
}
let galleryState = {
    items: [],
    loading: false,
    error: false,
    hasMore: false,
    favourites: false,
    after: null,
  },
  galleryRequest = 0;
const freshBackupState = () => ({
  busy: false,
  error: "",
  files: [],
  statuses: {},
  plan: null,
  input: null,
  mode: "keep",
  done: false,
  copies: [],
});
let backupState = freshBackupState();
async function loadGallery(more = false) {
  const request = ++galleryRequest;
  galleryState.loading = true;
  galleryState.error = false;
  if (!more) {
    galleryState.items = [];
    galleryState.after = null;
  }
  render();
  try {
    await Promise.all(archivePending.values());
    const indexing = await drawingArchive.indexExisting();
    if (indexing.invalid) issues.add("galleryDamaged");
    // Old saved recaps can contain only a preview. Preserve it and label it honestly.
    for (const game of [g, last].filter(Boolean))
      for (const h of game.history) {
        if (!h.artwork?.length) continue;
        const id = artworkKey(game.id, h.round);
        if (!(await drawingArchive.get(id)))
          await drawingArchive.put(id, h.artwork, h.canvasRatio || 4 / 3, {
            title: cardText(h.word),
            round: h.round,
            createdAt: game.createdAt || 0,
            previewOnly: true,
          });
      }
    const result = await drawingArchive.page({
      after: galleryState.after,
      favourites: galleryState.favourites,
    });
    if (request !== galleryRequest) return;
    galleryState = {
      ...galleryState,
      ...result,
      items: more ? [...galleryState.items, ...result.items] : result.items,
      loading: false,
    };
  } catch {
    if (request === galleryRequest) {
      galleryState.loading = false;
      galleryState.error = true;
    }
  }
  if (screen === "gallery" && request === galleryRequest) render();
}
async function previewRestore() {
  backupState.busy = true;
  backupState.error = "";
  backupState.plan = null;
  render();
  try {
    backupState.plan = await makeRestorePlan(
      backupState.input,
      localStorage,
      drawingArchive,
      backupState.mode,
    );
  } catch (e) {
    backupState.error = e.message;
  }
  backupState.busy = false;
  render();
}
document.addEventListener("change", async (e) => {
  if (["card-primary", "card-secondary"].includes(e.target.id)) {
    if (backupState.busy || localStorage.getItem(RESTORE_MARKER)) return;
    const [oldFirst, oldSecond] = cardLanguages(profile.settings.cardLanguage);
    const first = e.target.id === "card-primary" ? e.target.value : oldFirst;
    const second =
      e.target.id === "card-secondary" ? e.target.value : oldSecond;
    if (!validLocale(first) || (second && !validLocale(second))) return;
    profile.settings.cardLanguage = encodeCardLanguages(
      second && second !== first ? [first, second] : [first],
    );
    saveProfile();
    // Keep the native picker mounted: rebuilding and refocusing a select from
    // its change event can reopen the iOS picker as it is being dismissed.
    // Only the other picker and the preview depend on this selection.
    const updated = document.createElement("template");
    updated.innerHTML = cardLanguagePicker();
    if (e.target.id === "card-primary")
      $("#card-secondary").innerHTML =
        updated.content.querySelector("#card-secondary").innerHTML;
    $(".card-language-preview").innerHTML = updated.content.querySelector(
      ".card-language-preview",
    ).innerHTML;
    return;
  }
  if (e.target.id !== "backup-files" || backupState.busy) return;
  const files = [...e.target.files];
  if (!files.length) return;
  backupState.busy = true;
  backupState.error = "";
  backupState.plan = null;
  backupState.done = false;
  render();
  try {
    backupState.input = await decodeBackup(files);
    backupState.mode = "keep";
  } catch (err) {
    backupState.input = null;
    backupState.error = err.message;
  }
  backupState.busy = false;
  if (backupState.input) await previewRestore();
  else render();
});
window.addEventListener("storage", (e) => {
  if (e.key === RESTORE_MARKER && !backupState.busy) {
    if (e.newValue) {
      issues.add("restoreBusy");
      showNotice();
    } else location.reload();
  }
});
document.addEventListener("change", (e) => {
  if (!e.target.matches("[data-share-answer]") || !artSelection || artBusy) return;
  artAnswer = e.target.checked;
  void prepareArtPreview();
});
function addTextEntry(player, raw) {
  if (backupState.busy || localStorage.getItem(RESTORE_MARKER)) return;
  error = "";
  const value = raw.trim().replace(/\s+/g, " ").slice(0, player ? 20 : 30);
  if (!value) return;
  if (!player && !purchases.state.unlocked) {
    openPurchase();
    return;
  }
  const values = player ? profile.players.map((p) => p.name) : profile.custom;
  if (values.some((v) => v.toLowerCase() === value.toLowerCase()))
    error = "duplicate";
  else if (player && profile.players.length >= 12) error = "playerCount";
  else if (!player && profile.custom.length >= 200) error = "wordLimit";
  else if (player) {
    profile.players.push({
      id: uid(),
      name: value,
      team: profile.players.length % 2,
    });
    if (profile.players.length === 2) {
      profile.settings.mode = "coop";
      profile.settings.roundsEach = 3;
    } else if (profile.settings.mode === "coop")
      profile.settings.mode = "individual";
  } else profile.custom.push(value);
  saveProfile();
  render({ clearDraft: error ? null : player ? "player-input" : "word-input" });
  if (!nativeTextEntry) $(player ? "#player-input" : "#word-input")?.focus();
}
document.addEventListener("submit", e => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const player = form.dataset.form === "player";
  addTextEntry(player, $(player ? "#player-input" : "#word-input").value);
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled || backupState.busy) return;
  const a = el.dataset.action;
  if (a === "rename-team") {
    if (localStorage.getItem(RESTORE_MARKER)) return;
    const team = Number(el.dataset.teamName);
    const target = el.dataset.teamScope === "game" ? g?.settings : profile.settings;
    if (![0,1].includes(team) || !target) return;
    // Capacitor presents a UIKit UIAlertController text field. No DOM input
    // focus, nested scroller or WKWebView keyboard auto-pan is involved.
    const value = await requestTextEntry(t(team === 0 ? "teamA" : "teamB"), target.teamNames?.[team] || "", 20);
    if (value === null) return;
    target.teamNames = [...(target.teamNames || ["", ""])];
    target.teamNames[team] = cleanTeamName(value);
    if (target === profile.settings) saveProfile(); else persist();
    render();
    return;
  }

  if (a === "tv-refresh") {
    void refreshTV();
    return;
  }
  if (a === "tv-disable") {
    void tv?.enable(false);
    return;
  }
  if (
    a === "tv-continue" &&
    tvStatus.privateAllowed &&
    !tvStatus.resetRequired
  ) {
    tvContinueRequired = false;
    cover = false;
    if (screen === "game" && g?.phase === "drawing" && Game.remaining(g) > 0) {
      Game.resume(g);
      persist();
    }
    render();
    return;
  }
  if (tvGuarded()) return;
  if (localStorage.getItem(RESTORE_MARKER)) {
    issues.add("restoreBusy");
    showNotice();
    return;
  }
  if (a === "add-text-entry") {
    const player = el.dataset.kind === "player";
    if (!player && !purchases.state.unlocked) { openPurchase(); return; }
    const value = await requestTextEntry(t(player ? "playerName" : "customPlaceholder"), "", player ? 20 : 30);
    if (value !== null) addTextEntry(player, value);
    return;
  }
  if (a === "purchase-menu") {
    openPurchase();
    return;
  }
  if (a === "purchase-back") {
    navigate(purchaseReturn);
    return;
  }
  if (
    a === "purchase-buy" ||
    a === "purchase-restore" ||
    a === "purchase-refresh"
  ) {
    if (screen !== "purchase") return;
    await (a === "purchase-buy"
      ? purchases.purchase()
      : a === "purchase-restore"
        ? purchases.restore()
        : purchases.products());
    return;
  }
  if (
    !purchases.state.unlocked &&
    (["topic-toggle", "playlist", "remove-word"].includes(a) ||
      (a === "setting" && ["topic", "difficulty"].includes(el.dataset.key)))
  ) {
    openPurchase();
    return;
  }
  if (a === "tv-enable") {
    void tv?.enable(true);
    return;
  }
  if (a === "tv") {
    tvReturn = screen === "settings" ? "settings" : "home";
    navigate("tv");
    return;
  }
  if (a === "tv-back") {
    navigate(tvReturn);
    return;
  }
  if (["setting", "colour", "brush", "eraser", "team"].includes(a))
    feedback("selection");
  if (["reveal", "next-round", "intro-start", "replay"].includes(a))
    feedback("handoff");
  if (["home", "settings", "how", "words"].includes(a)) {
    navigate(a);
    return;
  }
  if (a === "intro-start") {
    profile.onboardingSeen = true;
    saveProfile();
    screen = "game";
    render();
    return;
  }
  if (a === "language-menu") {
    if (screen !== "languages") languageReturn = showingLast ? "home" : screen;
    navigate("languages");
    return;
  }
  if (a === "language-back") {
    navigate(languageReturn);
    if (screen === "game" && g && !g.finished) {
      cover = true;
      render();
    }
    return;
  }
  if (a === "language") {
    if (!validLocale(el.dataset.value)) return;
    profile.language = el.dataset.value;
    // Follow an explicit interface choice for future cards, retaining a distinct
    // second language. A running game owns its separate settings snapshot.
    const [, second] = cardLanguages(profile.settings.cardLanguage);
    profile.settings.cardLanguage = encodeCardLanguages(
      second && second !== profile.language
        ? [profile.language, second]
        : [profile.language],
    );
    saveProfile();
    void tv?.locale(profile.language);
    render();
    return;
  }
  if (a === "sound") {
    profile.muted = !profile.muted;
    saveProfile();
    render();
    return;
  }
  if (a === "setup") {
    step = 0;
    navigate("setup");
    return;
  }
  if (a === "quick") {
    const players =
      profile.players.length >= 2
        ? profile.players
        : [0, 1].map((i) => profile.players[i] || ({
            id: uid(),
            name: `${t("player")} ${i + 1}`,
            team: i,
          }));
    const settings = {
      ...defaults,
      mode: players.length === 2 ? "coop" : "individual",
      roundsEach: 3,
      topic: "starter",
      difficulty: "easy",
      drawPolicy: "unique",
      cardLanguage: profile.settings.cardLanguage,
    };
    // Keep saved setup/preferences intact. Quick Play always uses the advertised preset.
    startNew(players, settings, deckFor(settings, false), true);
    return;
  }
  if (a === "open-scorecard") {
    if (screen !== "final" || !g?.finished) return;
    const entries = g.settings.mode === "teams"
      ? g.teamScores.map((score, team) => ({ score, name: teamName(team, g.settings) }))
      : g.players.map(p => ({ name: p.name, score: p.score }));
    const high = Math.max(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === high);
    artSelection = { kind: "score", data: {
      language: profile.language, title: t("score"),
      headline: g.settings.mode === "coop" ? t("together") : high === 0 ? t("noWinner") : winners.length > 1 ? t("tie") : winners[0].name,
      entries: g.settings.mode === "coop" ? [{ name: t("together"), score: cooperationScore(g) }] : entries.sort((a,b) => b.score-a.score),
      caption: `${t("total")}: ${g.history.length}`,
    }};
    artAnswer = false; artStatus = "";
    await prepareArtPreview(); return;
  }
  if (a === "open-artwork") {
    let item =
      el.dataset.index === "current" &&
      screen === "game" &&
      g.phase === "result"
        ? { strokes: g.strokes, ratio: g.canvasRatio === 1 ? 1 : 4 / 3, title: cardText(g.word) }
        : screen === "final" && g.history[Number(el.dataset.index)]
          ? {
              title: cardText(g.history[Number(el.dataset.index)].word),
              strokes: g.history[Number(el.dataset.index)].artwork,
              ratio: g.history[Number(el.dataset.index)].canvasRatio || 4 / 3,
            }
          : null;
    if (!item?.strokes?.length) return;
    if (el.dataset.index !== "current") {
      const key = artworkKey(g.id, g.history[Number(el.dataset.index)].round);
      const sourceGame = g;
      el.disabled = true;
      await archivePending.get(key);
      try {
        const stored = await drawingArchive.get(key);
        item = stored
          ? { ...item, strokes: stored.strokes, ratio: stored.ratio }
          : { ...item, previewOnly: true };
      } catch {
        item.previewOnly = true;
      }
      // Navigation while storage is loading must never open the wrong game's drawing.
      if (g !== sourceGame || screen !== "final") return;
      el.disabled = false;
    }

    artSelection = item;
    artAnswer = false;
    artStatus = "";
    await prepareArtPreview();
    return;
  }
  if (a === "close-artwork") {
    if (artBusy) return;
    artSelection = null;
    render();
    return;
  }
  if (a === "save-artwork" || a === "share-artwork") {
    if (!artSelection || artBusy || !artPreview) return;
    artBusy = true;
    artStatus = "artworkWorking";
    try {
      // Start the platform request within the tap's user activation.
      const request = exportArtwork(
        a === "save-artwork" ? "save" : "share",
        artPreview,
      );
      render();
      const result = await request;
      artStatus =
        {
          saved: "artworkSaved",
          shared: "artworkShared",
          cancelled: "artworkCancelled",
          downloaded: "artworkDownloaded",
          denied: "artworkDenied",
        }[result?.status] || "artworkFailed";
    } catch {
      artStatus = "artworkFailed";
    }
    artBusy = false;
    render();
    return;
  }
  if (a === "step") {
    goSetupStep(Number(el.dataset.step));
    return;
  }
  if (a === "next-step" || a === "prev-step") {
    if (a === "prev-step" && step === 0) {
      navigate("home");
      return;
    }
    goSetupStep(Math.max(0, Math.min(3, step + (a === "next-step" ? 1 : -1))));
    return;
  }
  if (a === "topic-toggle") {
    const key = el.dataset.value;
    if (!Object.hasOwn(content.topics, key)) return;
    const current = needsTopicReview(profile.settings.topic) ? "unavailable" : resolveTopic(content, profile.settings.topic);
    const next = toggleTopic(content, current, key);
    if (next === current) {
      error = "topicAtLeastOne";
    } else {
      profile.settings.topic = next;
      error = "";
      saveProfile();
    }
    render();
    return;
  }
  if (a === "topics-done") {
    render({ closeDisclosure: "subjects" });
    return;
  }
  if (a === "add-topics") {
    const chooser = document.querySelector('[data-disclosure="subjects"]');
    if (chooser) {
      chooser.open = true;
      chooser.querySelector("summary").focus();
      chooser.scrollIntoView({ block: "start", behavior: "instant" });
    }
    return;
  }
  if (a === "playlist") {
    const key = el.dataset.value;
    if (!Object.hasOwn(playlists, key)) return;
    profile.settings.topic = key;
    profile.settings.difficulty = playlists[key];
    error = "";
    saveProfile();
    render({ closeDisclosure: "subjects" });
    return;
  }
  if (a === "pool-recovery") {
    if (el.dataset.value === "levels") updateSetting("difficulty", "general");
    else if (el.dataset.value === "mixed") updateSetting("topic", "mixed");
    else if (el.dataset.value === "rounds") updateSetting("roundsEach", 1);
    return;
  }
  if (a === "setting") {
    updateSetting(el.dataset.key, el.dataset.value);
    return;
  }
  if (a === "remove-player") {
    profile.players = profile.players.filter((p) => p.id !== el.dataset.id);
    saveProfile();
    render();
    return;
  }
  if (a === "team") {
    const p = profile.players.find((p) => p.id === el.dataset.id);
    if (p) p.team = 1 - p.team;
    saveProfile();
    render();
    return;
  }
  if (a === "remove-word") {
    profile.custom.splice(Number(el.dataset.index), 1);
    if (!profile.custom.length && profile.settings.topic === "custom")
      profile.settings.topic = "mixed";
    saveProfile();
    render();
    return;
  }
  if (a === "fix-setup") {
    const issue = Game.setupError(profile.players, futureSettings(), deckFor());
    step = setupErrorStep(issue);
    error = issue;
    render();
    $("#player-input")?.focus();
    return;
  }
  if (a === "start-game") {
    startNew(profile.players, profile.settings, deckFor(), profile.settings.topic === "mixed");
    return;
  }
  if (a === "resume-game") {
    if (!g) return;
    if (g.finished) {
      finishSave();
      return;
    }
    screen = "game";
    cover = g.phase === "reveal";
    render();
    return;
  }
  if (a === "last" && last) {
    if (g && !g.finished) persist();
    g = Game.clone(last);
    showingLast = true;
    screen = "final";
    render();
    return;
  }
  if (a === "replay") {
    const source = g;
    if (!source) return;
    // Historical games keep their exact words. A replay is a new game and must
    // obey the current catalogue without silently recycling parked prompts.
    if (isPausedSelection(source.settings)) {
      step = 2;
      navigate("setup");
      error = "pausedDeck";
      render();
      return;
    }
    if (!purchases.state.ready) {
      openPurchase();
      return;
    }
    const settings = purchases.state.unlocked
      ? futureSettings(source.settings)
      : freeSettings(source.settings, source.players);
    const replayDeck = purchases.state.unlocked
      ? eligibleReplayDeck(content, source.deck, settings)
      : freeDeck(content);
    if (source.legacy && source.players.length === 2) settings.mode = "coop";
    const issue = Game.setupError(source.players, settings, replayDeck);
    if (issue) {
      // Navigation restores a separate active game when reviewing Last Game.
      // Neither the old game nor the player's saved setup is replaced.
      step = setupErrorStep(issue);
      navigate("setup");
      error = ["deckCount", "uniquePool"].includes(issue)
        ? "replayPoolShort"
        : issue;
      render();
      return;
    }
    const active = showingLast ? store.read(KEYS.game, Game.validGame) : null;
    if (active && !confirm(t("newConfirm"))) return;
    g = Game.newGame(source.players, settings, replayDeck, Date.now(), source);
    showingLast = false;
    screen = "game";
    persist();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (
    a === "gallery" ||
    a === "gallery-retry" ||
    a === "gallery-more" ||
    a === "gallery-filter"
  ) {
    if (a === "gallery") navigate("gallery");
    if (a === "gallery-filter")
      galleryState.favourites = el.dataset.filter === "favourites";
    await loadGallery(a === "gallery-more");
    return;
  }
  if (a === "gallery-back") {
    navigate("home");
    return;
  }
  if (a === "gallery-favourite") {
    el.disabled = true;
    try {
      const favourite = await drawingArchive.favourite(el.dataset.id);
      // Keep loaded pages and the viewport. A favourite toggle is not a new query.
      galleryState.items = galleryState.items.map((item) =>
        item.id === el.dataset.id ? { ...item, favourite } : item,
      );
      if (galleryState.favourites)
        galleryState.items = galleryState.items.filter(
          (item) => item.favourite,
        );
      if (screen === "gallery") render();
    } catch {
      galleryState.error = true;
      if (screen === "gallery") render();
    }
    return;
  }
  if (a === "gallery-open") {
    el.disabled = true;
    try {
      const r = await drawingArchive.get(el.dataset.id);
      if (!r) throw new Error("Missing artwork");
      if (screen !== "gallery") return;
      artSelection = {
        strokes: r.strokes,
        ratio: r.ratio,
        title: galleryState.items.find((i) => i.id === r.id)?.title || "",
        previewOnly: galleryState.items.find((i) => i.id === r.id)?.previewOnly,
      };
      artAnswer = false;
      artStatus = "";
      await prepareArtPreview();
    } catch {
      galleryState.error = true;
      if (screen === "gallery") render();
    }
    return;
  }
  if (a === "backup") {
    backupState = freshBackupState();
    backupState.busy = true;
    navigate("backup");
    try {
      backupState.copies = await drawingArchive.recoveries();
    } catch {}
    backupState.busy = false;
    if (screen === "backup") render();
    return;
  }
  if (a === "backup-pick") {
    $("#backup-files").click();
    return;
  }
  if (a === "backup-create" || a === "backup-previous") {
    backupState.busy = true;
    backupState.error = "";
    backupState.files = [];
    render();
    try {
      await Promise.all(archivePending.values());
      let drawings = [],
        unavailable = false;
      try {
        drawings = await drawingArchive.all();
      } catch {
        unavailable = true;
        issues.add("backupPartial");
      }
      const data = captureBackup(
        localStorage,
        { profile, game: g, last },
        drawings,
        unavailable,
      );
      if (a === "backup-previous") {
        const previous = await drawingArchive.recoveryCopy(el.dataset.id);
        if (!previous?.before) throw new Error("backupInvalid");
        data.raw = previous.before;
        data.inMemory = {};
        // Preserve the original imported legacy source alongside the safe current snapshot.
        data.recoverySourceRaw = previous.sourceRaw;
      }
      backupState.files = await encodeBackup(data);
      backupState.statuses = {};
    } catch (e) {
      backupState.error = e.message;
    }
    backupState.busy = false;
    render();
    return;
  }
  if (a === "backup-save") {
    const index = Number(el.dataset.index),
      file = backupState.files[index];
    if (!file) return;
    backupState.busy = true;
    try {
      const request = exportBackupFile(file);
      render();
      const result = await request;
      backupState.statuses[index] = result.status || "failed";
    } catch {
      backupState.statuses[index] = "failed";
    }
    backupState.busy = false;
    render();
    return;
  }
  if (a === "backup-mode") {
    backupState.mode = el.dataset.mode;
    await previewRestore();
    return;
  }
  if (a === "backup-cancel") {
    backupState.plan = null;
    backupState.input = null;
    backupState.error = "";
    render();
    return;
  }
  if (a === "backup-restore") {
    if (!backupState.plan) return;
    backupState.busy = true;
    backupState.error = "";
    render();
    try {
      await applyRestore(backupState.plan, localStorage, drawingArchive);
      for (const key of Object.values(KEYS)) store.blocked.delete(key);
      profile = store.read(KEYS.profile, validProfile) || profile;
      void tv?.locale(profile.language);
      g = store.read(KEYS.game, Game.validGame);
      last = store.read(KEYS.last, Game.validGame);
      if (g) Game.pause(g);
      showingLast = false;
      archivedSignature = "";
      formDrafts.clear();
      backupState.done = true;
      backupState.plan = null;
      backupState.input = null;
      backupState.copies = await drawingArchive.recoveries();
    } catch (e) {
      backupState.error = e.message;
    }
    backupState.busy = false;
    render();
    return;
  }
  if (a === "reset") {
    if (!confirm(t("resetConfirm"))) return;
    let ok = true;
    for (const k of Object.values(KEYS)) if (!store.remove(k)) ok = false;
    if (ok) {
      profile = {
        version: 1,
        language: profile.language,
        muted: false,
        players: [],
        custom: [],
        settings: { ...defaults },
      };
      g = null;
      last = null;
      formDrafts.clear();
      issues.clear();
      saveProfile();
      navigate("home");
    }
    return;
  }
  if (screen !== "game" || !g || g.finished) return;
  canvasView?.flush();
  if (a === "exit") {
    navigate("home");
    return;
  }
  if (a === "uncover") {
    cover = false;
    render();
    return;
  }
  if (a === "scores") {
    if (g.timer.running) Game.pause(g);
    scores = !scores;
    persist();
    render();
    return;
  }
  if (a === "palette" && g.phase === "drawing") {
    if (Game.remaining(g) <= 0) {
      Game.end(g, "timeout");
    } else {
      paletteResume = g.timer.running;
      Game.pause(g);
      palette = true;
    }
    persist();
    render();
    return;
  }
  if (a === "close-palette") {
    closePalette();
    persist();
    render();
    return;
  }
  if (a === "judge") {
    judging = Game.beginJudgement(g);
    persist();
    render();
    return;
  }
  if (a === "cancel-judge") {
    judging = false;
    persist();
    render();
    return;
  }
  if (a === "cancel-clear" || a === "confirm-clear") {
    if (clearRequested && a === "confirm-clear" && g.phase === "drawing") {
      g.clearUndo = Game.clone(g.strokes); g.strokes = []; g.redo = [];
    }
    clearRequested = false; persist(); render(); return;
  }
  if (g.phase === "drawing" && a === "clear-canvas" && g.strokes.length) {
    // Nonblocking dialog keeps the native TV heartbeat alive while paused.
    // Both outcomes stay paused until the player explicitly continues.
    if (Game.remaining(g) <= 0) {
      Game.end(g, "timeout");
      sound("timeout");
      persist();
      render();
      return;
    }
    Game.pause(g);
    clearRequested = true;
    persist(); render(); return;
  }
  let changed = false;
  if (a === "reveal") changed = Game.reveal(g);
  if (a === "swap") changed = Game.swap(g);
  if (a === "return-original") changed = Game.returnOriginal(g);
  if (a === "draw") {
    changed = Game.start(g);
    if (changed) { Object.assign(brush, defaultBrush()); sound("go"); }
  }
  if (a === "toggle-pause") {
    if (g.timer.running) {
      Game.pause(g);
      changed = true;
    } else if (g.timer.msLeft <= 0) {
      changed = Game.end(g, "timeout");
    } else changed = Game.resume(g);
  }
  if (a === "correct" || a === "give-up") {
    if (a === "correct" && !judging) return;
    judging = false;
    changed = a === "correct" && g.phase === "result" ? Game.correctResult(g, el.dataset.id) : Game.end(
      g,
      a === "correct" ? "correct" : "giveup",
      el.dataset.id,
    );
    if (changed) sound(g.result.type);
  }
  if (a === "undo") {
    if (g.phase === "result" && g.result.msLeft <= 0) judging = true;
    else changed = Game.undo(g);
  }
  if (a === "next-round") {
    changed = Game.next(g);
    if (g.finished) {
      finishSave();
      return;
    }
  }
  if (a === "finish" && confirm(t("finishConfirm"))) {
    Game.finish(g);
    finishSave();
    return;
  }
  if (g.phase === "drawing") {
    if (a === "colour") {
      brush.color = el.dataset.value;
      brush.eraser = false;
    }
    if (a === "brush") {
      brush.width = Number(el.dataset.value);
      brush.eraser = false;
    }
    if (a === "eraser") brush.eraser = !brush.eraser;
    if (a === "undo-stroke") {
      if (g.strokes.length) g.redo.push(g.strokes.pop());
      else if (g.clearUndo) {
        g.strokes = g.clearUndo;
        g.clearUndo = null;
      }
    }
    if (a === "redo-stroke" && g.redo.length) g.strokes.push(g.redo.pop());

  }
  persist();
  render();
  if (changed && g.phase !== "drawing") window.scrollTo(0, 0);
});
for (const event of ["pointerdown", "keydown"])
  document.addEventListener(event, (e) => {
    if (
      e.target.closest("[data-peek]") &&
      (event === "pointerdown" || [" ", "Enter"].includes(e.key))
    ) {
      e.preventDefault();
      peek(true);
    }
  });
for (const event of ["pointerup", "pointercancel", "keyup", "focusout"])
  document.addEventListener(event, () => peek(false));
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("[data-peek]")) e.preventDefault();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hide();
  else {
    updateWake();
    if (tvBridge) void refreshTV();
  }
});
window.addEventListener("pagehide", hide);
window.addEventListener("native-pause", hide);
window.addEventListener(
  "purchase-status-changed",
  () => void purchases.refresh({ changed: true }),
);
window.addEventListener("native-active", () => {
  void purchases.refresh();
  if (tvBridge) void refreshTV();
  window.webkit?.messageHandlers?.partyState?.postMessage({
    playing: screen === "game",
  });
});
window.addEventListener("blur", () => peek(false));
setInterval(() => {
  publishTV();
  if (screen !== "game" || !g || g.phase !== "drawing" || !g.timer.running)
    return;
  const ms = Game.remaining(g),
    seconds = Math.ceil(ms / 1000);
  if ($("#t-num")) $("#t-num").textContent = seconds;
  $(".timer")?.classList.toggle("time-low", seconds <= 10);
  if ($("#time-progress")) {
    $("#time-progress").setAttribute("aria-valuenow", seconds);
    $("#time-progress span").style.width =
      `${Math.max(0, Math.min(100, (ms / g.timer.duration) * 100))}%`;
  }
  if (seconds !== lastSecond) {
    lastSecond = seconds;
    if (!localStorage.getItem(RESTORE_MARKER)) store.checkpointTimer(g);
  }
  if (ms <= 0) {
    canvasView?.flush();
    Game.end(g, "timeout");
    sound("timeout");
    persist();
    render();
  }
}, 100);
// Native bridge is local and optional; no remote website is loaded by the iOS app.
if (window.Capacitor?.isNativePlatform?.()) {
  try {
    const { App } = await import("./native.mjs");
    App?.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) hide();
    });
  } catch {}
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
function updateVisibleViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty("--visible-top", `${viewport?.offsetTop || 0}px`);
  document.documentElement.style.setProperty(
    "--visible-height",
    `${viewport?.height || innerHeight}px`,
  );
  document.documentElement.classList.toggle(
    "keyboard-open",
    !!viewport &&
      innerHeight - viewport.height > 140 &&
      !!document.activeElement?.matches("input, textarea"),
  );
}
window.visualViewport?.addEventListener("resize", updateVisibleViewport);
window.visualViewport?.addEventListener("scroll", updateVisibleViewport);
window.addEventListener("resize", updateVisibleViewport);
document.addEventListener("focusin", updateVisibleViewport);
document.addEventListener("focusout", updateVisibleViewport);
updateVisibleViewport();
tv = createTVTransport({ bridge: tvBridge, onStatus: handleTVStatus });
render();
purchaseStartup = purchases.refresh();
void tv.start().then(() => tv.locale(profile.language));
if (tvBridge) setInterval(() => void refreshTV(), 2000);
