'use strict';

/* ===================== utils ===================== */

const $ = (sel, el = document) => el.querySelector(sel);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const shuffle = (arr) => {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const AVATAR_COLORS = [
  '#f97316', '#10b981', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444',
];

const avatarColor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

const initials = (name) =>
  name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const RING_LEN = 2 * Math.PI * 90; // matches r=90 in the SVG

/* ===================== storage ===================== */

const store = {
  get(k, fb) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fb : JSON.parse(v);
    } catch {
      return fb;
    }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

const K = {
  roster: 'pp_roster',
  settings: 'pp_settings',
  game: 'pp_game',
  muted: 'pp_muted',
  customWords: 'pp_custom_words',
};

const DEFAULT_ROSTER = ['Isaac', 'Enoch', 'Winnie', 'Stephen'];
const CUSTOM_MIN_WORDS = 5;

/* ===================== sound ===================== */

const sound = {
  ctx: null,
  muted: store.get(K.muted, false),
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  play(freq, dur, type, vol, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },
  tick() { this.play(1000, 0.07, 'square', 0.06); },
  buzzer() {
    this.play(196, 0.55, 'sawtooth', 0.18);
    this.play(147, 0.65, 'sawtooth', 0.18, 0.05);
  },
  chime() {
    [523, 659, 784, 1047].forEach((f, i) => this.play(f, 0.2, 'sine', 0.14, i * 0.09));
  },
  toggle() {
    this.muted = !this.muted;
    store.set(K.muted, this.muted);
    if (!this.muted) this.ensure();
  },
};

/* ===================== wake lock ===================== */

let wakeLock = null;

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not critical */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'game') keepAwake();
});

/* ===================== state ===================== */

const savedRoster = store.get(K.roster, null);

const state = {
  screen: 'setup', // setup | game | final
  // An empty roster is re-seeded with the family defaults.
  roster: savedRoster && savedRoster.length
    ? savedRoster
    : DEFAULT_ROSTER.map((name) => ({ id: uid(), name })),
  settings: Object.assign(
    { topic: 'animals', seconds: 60, roundsEach: 2 }, // roundsEach 0 = endless
    store.get(K.settings, {})
  ),
  customWords: store.get(K.customWords, []), // [string]
  game: store.get(K.game, null),
  ui: { showScores: false, error: '', wordError: '', refocus: false, refocusWord: false },
};

// 'custom' (My Words) only shows up once it has words.
function topicKeys() {
  const keys = [...Object.keys(WORD_BANK)];
  if (state.customWords.length) keys.push('custom');
  keys.push('mixed');
  return keys;
}

function topicInfo(key) {
  if (key === 'mixed') {
    return {
      label: 'Mixed',
      emoji: '🎲',
      words: [...Object.values(WORD_BANK).flatMap((t) => t.words), ...state.customWords],
    };
  }
  if (key === 'custom') {
    return { label: 'My Words', emoji: '✏️', words: [...state.customWords] };
  }
  return WORD_BANK[key];
}

function currentMsLeft(g) {
  return g.timer.running ? Math.max(0, g.timer.endAt - Date.now()) : g.timer.msLeft;
}

function persist() {
  const g = state.game;
  if (!g) {
    store.del(K.game);
    return;
  }
  // Snapshot with the timer frozen, so reloading resumes paused instead of
  // silently burning time while the page was closed.
  store.set(K.game, {
    ...g,
    timer: { ...g.timer, msLeft: currentMsLeft(g), running: false, endAt: null },
  });
}

/* ===================== game actions ===================== */

function addPlayer(rawName) {
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!name) return;
  if (state.roster.length >= 12) {
    state.ui.error = 'Maximum 12 players.';
    render();
    return;
  }
  if (state.roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    state.ui.error = `"${name}" is already on the list.`;
    render();
    return;
  }
  state.roster.push({ id: uid(), name });
  state.ui.error = '';
  state.ui.refocus = true;
  store.set(K.roster, state.roster);
  render();
}

function removePlayer(id) {
  state.roster = state.roster.filter((p) => p.id !== id);
  state.ui.error = '';
  store.set(K.roster, state.roster);
  render();
}

function saveSettings() {
  store.set(K.settings, state.settings);
}

function addCustomWord(rawWord) {
  const word = rawWord.trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!word) return;
  if (state.customWords.length >= 200) {
    state.ui.wordError = 'Maximum 200 custom words.';
    render();
    return;
  }
  if (state.customWords.some((w) => w.toLowerCase() === word.toLowerCase())) {
    state.ui.wordError = `"${word}" is already in your list.`;
    render();
    return;
  }
  state.customWords.push(word);
  state.ui.wordError = '';
  state.ui.refocusWord = true;
  store.set(K.customWords, state.customWords);
  render();
}

function removeCustomWord(word) {
  state.customWords = state.customWords.filter((w) => w !== word);
  state.ui.wordError = '';
  store.set(K.customWords, state.customWords);
  if (!state.customWords.length && state.settings.topic === 'custom') {
    state.settings.topic = 'animals';
    saveSettings();
  }
  render();
}

function canStartGame() {
  if (state.roster.length < 2) return false;
  if (state.settings.topic === 'custom' && state.customWords.length < CUSTOM_MIN_WORDS) return false;
  return true;
}

function startGame() {
  if (!canStartGame()) return;
  const s = state.settings;
  const players = state.roster.map((p) => ({ id: p.id, name: p.name, score: 0 }));
  state.game = {
    players,
    topic: s.topic,
    deck: shuffle(topicInfo(s.topic).words),
    deckPos: 0,
    drawerPos: 0,
    round: 1,
    totalRounds: s.roundsEach > 0 ? s.roundsEach * players.length : null,
    phase: 'handoff', // handoff | reveal | drawing | result
    word: null,
    timer: { duration: s.seconds * 1000, msLeft: s.seconds * 1000, running: false, endAt: null },
    result: null,
    history: [], // one entry per finished round, for the final recap
  };
  state.screen = 'game';
  state.ui.showScores = false;
  persist();
  keepAwake();
  render();
}

function drawWord(g) {
  if (g.deckPos >= g.deck.length) {
    g.deck = shuffle(g.deck);
    g.deckPos = 0;
  }
  return g.deck[g.deckPos++];
}

function toReveal() {
  const g = state.game;
  if (!g.word) g.word = drawWord(g);
  g.phase = 'reveal';
  sound.ensure();
  persist();
  render();
}

function swapWord() {
  const g = state.game;
  g.word = drawWord(g);
  persist();
  render();
}

function startDrawing() {
  const g = state.game;
  g.phase = 'drawing';
  g.timer.msLeft = g.timer.duration;
  g.timer.running = true;
  g.timer.endAt = Date.now() + g.timer.duration;
  lastTickSecond = null;
  sound.ensure();
  persist();
  render();
}

function togglePause() {
  const t = state.game.timer;
  if (t.running) {
    t.msLeft = Math.max(0, t.endAt - Date.now());
    t.running = false;
    t.endAt = null;
  } else {
    t.endAt = Date.now() + t.msLeft;
    t.running = true;
  }
  persist();
  render();
}

function endRound(type, winnerId = null) {
  const g = state.game;
  if (!g || g.phase !== 'drawing') return;
  const msLeftAtEnd = currentMsLeft(g);
  g.timer.running = false;
  g.timer.endAt = null;
  g.timer.msLeft = msLeftAtEnd;

  const deltas = [];
  let winner = null;
  const drawer = g.players[g.drawerPos];
  if (type === 'correct' && winnerId) {
    winner = g.players.find((p) => p.id === winnerId);
    if (winner) {
      winner.score += 1;
      deltas.push({ id: winner.id, delta: 1 });
    }
    if (drawer && drawer.id !== winnerId) {
      drawer.score += 1;
      deltas.push({ id: drawer.id, delta: 1 });
    }
    sound.chime();
  } else if (type === 'timeout') {
    sound.buzzer();
  }

  if (!g.history) g.history = []; // games saved before recaps existed
  g.history.push({
    round: g.round,
    word: g.word,
    drawer: drawer ? drawer.name : '',
    winner: winner ? winner.name : null,
    type,
  });

  g.result = { type, winnerId, word: g.word, deltas, msLeftAtEnd };
  g.phase = 'result';
  persist();
  render();
}

function undoResult() {
  const g = state.game;
  const r = g.result;
  if (!r) return;
  r.deltas.forEach((d) => {
    const p = g.players.find((pl) => pl.id === d.id);
    if (p) p.score -= d.delta;
  });
  if (g.history) g.history.pop();
  g.result = null;
  g.phase = 'drawing';
  // Resume paused, and leave at least a second so play can continue.
  g.timer.msLeft = Math.max(r.msLeftAtEnd, 1000);
  g.timer.running = false;
  g.timer.endAt = null;
  persist();
  render();
}

function nextRound() {
  const g = state.game;
  if (g.totalRounds && g.round >= g.totalRounds) {
    finishGame();
    return;
  }
  g.round += 1;
  g.drawerPos = (g.drawerPos + 1) % g.players.length;
  g.word = null;
  g.result = null;
  g.phase = 'handoff';
  g.timer.msLeft = g.timer.duration;
  g.timer.running = false;
  g.timer.endAt = null;
  persist();
  render();
}

function finishGame() {
  state.screen = 'final';
  state.ui.showScores = false;
  store.del(K.game); // a finished game should not offer "resume"
  render();
}

function exitToSetup(discard) {
  if (discard) {
    state.game = null;
    store.del(K.game);
  }
  state.screen = 'setup';
  state.ui.showScores = false;
  render();
}

function playAgain() {
  const g = state.game;
  if (!g) return;
  g.players.forEach((p) => { p.score = 0; });
  g.deck = shuffle(g.deck);
  g.deckPos = 0;
  g.drawerPos = 0;
  g.round = 1;
  g.word = null;
  g.result = null;
  g.history = [];
  g.phase = 'handoff';
  g.timer.msLeft = g.timer.duration;
  g.timer.running = false;
  g.timer.endAt = null;
  state.screen = 'game';
  persist();
  keepAwake();
  render();
}

/* ===================== timer loop ===================== */

let lastTickSecond = null;

setInterval(() => {
  const g = state.game;
  if (!g || state.screen !== 'game' || g.phase !== 'drawing' || !g.timer.running) return;
  const ms = currentMsLeft(g);
  const sec = Math.ceil(ms / 1000);
  if (sec !== lastTickSecond) {
    lastTickSecond = sec;
    if (sec > 0 && sec <= 5) sound.tick();
  }
  syncTimerDom(ms);
  if (ms <= 0) endRound('timeout');
}, 100);

function timerColorClass(frac) {
  if (frac > 0.5) return 't-ok';
  if (frac > 0.2) return 't-warn';
  return 't-danger';
}

function syncTimerDom(ms) {
  const g = state.game;
  const wrap = $('#timer');
  if (!wrap || !g) return;
  const frac = Math.max(0, Math.min(1, ms / g.timer.duration));
  const num = $('#t-num');
  if (num) num.textContent = Math.ceil(ms / 1000);
  const ring = $('.ring-fg', wrap);
  if (ring) ring.style.strokeDashoffset = (RING_LEN * (1 - frac)).toFixed(1);
  wrap.classList.remove('t-ok', 't-warn', 't-danger');
  wrap.classList.add(timerColorClass(frac));
  wrap.classList.toggle('paused', !g.timer.running);
  const sub = $('.t-sub', wrap);
  if (sub) sub.textContent = g.timer.running ? 'tap to pause' : 'paused — tap to resume';
}

/* ===================== templates ===================== */

function avatarHtml(name, idx, cls = '') {
  return `<span class="avatar ${cls}" style="background:${avatarColor(idx)}">${esc(initials(name))}</span>`;
}

function scoreListHtml(players, opts = {}) {
  const { deltas = [], drawerId = null } = opts;
  const deltaMap = Object.fromEntries(deltas.map((d) => [d.id, d.delta]));
  const ranked = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const medals = ['🥇', '🥈', '🥉'];
  return `<div class="score-list">${ranked
    .map((p, i) => {
      const idx = players.indexOf(p);
      const rank = i < 3 && p.score > 0 ? medals[i] : `${i + 1}`;
      const delta = deltaMap[p.id] ? `<span class="delta">+${deltaMap[p.id]}</span>` : '';
      const drawerCls = p.id === drawerId ? ' is-drawer' : '';
      return `<div class="score-row${drawerCls}">
        <span class="rank">${rank}</span>
        ${avatarHtml(p.name, idx)}
        <span class="name">${esc(p.name)}</span>
        ${delta}
        <span class="pts">${p.score}</span>
      </div>`;
    })
    .join('')}</div>`;
}

function gameTopbarHtml(g) {
  const t = topicInfo(g.topic);
  const roundLabel = g.totalRounds ? `Round ${g.round} / ${g.totalRounds}` : `Round ${g.round}`;
  return `<div class="topbar">
    <button class="pill" data-action="exit-game" aria-label="Exit game">✕ Exit</button>
    <span class="pill static">${roundLabel}</span>
    <span class="pill static">${t.emoji} ${esc(t.label)}</span>
    <span class="spacer"></span>
    <button class="pill" data-action="toggle-sound" aria-label="Toggle sound">${sound.muted ? '🔇' : '🔊'}</button>
    <button class="pill" data-action="toggle-scores">🏆 Scores</button>
  </div>`;
}

function timerHtml(g) {
  const ms = currentMsLeft(g);
  const frac = Math.max(0, Math.min(1, ms / g.timer.duration));
  return `<div class="timer-wrap ${timerColorClass(frac)}${g.timer.running ? '' : ' paused'}" id="timer" data-action="toggle-pause">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ring-bg" cx="100" cy="100" r="90"></circle>
      <circle class="ring-fg" cx="100" cy="100" r="90"
        stroke-dasharray="${RING_LEN.toFixed(1)}"
        stroke-dashoffset="${(RING_LEN * (1 - frac)).toFixed(1)}"></circle>
    </svg>
    <div class="timer-center">
      <div id="t-num">${Math.ceil(ms / 1000)}</div>
      <div class="t-sub">${g.timer.running ? 'tap to pause' : 'paused — tap to resume'}</div>
    </div>
  </div>`;
}

/* ---------- setup screen ---------- */

function setupHtml() {
  const s = state.settings;
  const canStart = canStartGame();
  const needsCustomWords = s.topic === 'custom' && state.customWords.length < CUSTOM_MIN_WORDS;
  const totalRounds = s.roundsEach > 0 ? s.roundsEach * state.roster.length : null;

  const resume = state.game
    ? `<div class="card banner">
        <h2 class="section-title">Game in progress</h2>
        <p class="subtle" style="margin-top:0">Round ${state.game.round}${state.game.totalRounds ? ` of ${state.game.totalRounds}` : ''} · ${esc(topicInfo(state.game.topic).label)}</p>
        <div class="row">
          <button class="btn primary" data-action="resume-game">▶ Resume game</button>
          <button class="btn soft-danger" data-action="discard-game">Discard</button>
        </div>
      </div>`
    : '';

  const playerChips = state.roster
    .map(
      (p, i) => `<span class="player-chip">${avatarHtml(p.name, i)}${esc(p.name)}
        <button class="x" data-action="remove-player" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>
      </span>`
    )
    .join('');

  const topicChips = topicKeys().map((key) => {
    const t = topicInfo(key);
    return `<button class="chip${s.topic === key ? ' on' : ''}" data-action="set-topic" data-topic="${key}">
      ${t.emoji} ${esc(t.label)} <small>${t.words.length} words</small>
    </button>`;
  }).join('');

  const customChips = state.customWords
    .map(
      (w) => `<span class="player-chip word-chip">${esc(w)}
        <button class="x" data-action="remove-word" data-word="${esc(w)}" aria-label="Remove ${esc(w)}">✕</button>
      </span>`
    )
    .join('');

  const timeChips = [30, 60, 90, 120]
    .map(
      (sec) => `<button class="chip${s.seconds === sec ? ' on' : ''}" data-action="set-seconds" data-seconds="${sec}">${sec}s</button>`
    )
    .join('');

  const roundChips = [1, 2, 3, 0]
    .map(
      (n) => `<button class="chip${s.roundsEach === n ? ' on' : ''}" data-action="set-rounds" data-rounds="${n}">${n === 0 ? '∞ Endless' : `${n}×`}</button>`
    )
    .join('');

  return `<div class="wrap">
    <div class="topbar"><h1 class="title">🎨 Pictionary Party</h1></div>
    ${resume}
    <div class="card">
      <h2 class="section-title">Players (${state.roster.length})</h2>
      <form class="add-row" data-form="add-player">
        <input id="player-input" type="text" placeholder="Player name" maxlength="20"
          autocomplete="off" autocapitalize="words" enterkeyhint="done">
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div class="player-chips">${playerChips || '<p class="hint" style="margin:0">Add everyone who is playing — at least 2 players.</p>'}</div>
      ${state.ui.error ? `<p class="error">${esc(state.ui.error)}</p>` : ''}
    </div>
    <div class="card">
      <h2 class="section-title">Topic</h2>
      <div class="chips">${topicChips}</div>
    </div>
    <div class="card">
      <h2 class="section-title">✏️ My Words (${state.customWords.length})</h2>
      <form class="add-row" data-form="add-word">
        <input id="word-input" type="text" placeholder="Add your own word — family jokes welcome!" maxlength="30"
          autocomplete="off" autocapitalize="none" enterkeyhint="done">
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div class="player-chips">${customChips || `<p class="hint" style="margin:0">Build your own topic! Add at least ${CUSTOM_MIN_WORDS} words and "My Words" appears as a topic (they join the Mixed deck too).</p>`}</div>
      ${state.ui.wordError ? `<p class="error">${esc(state.ui.wordError)}</p>` : ''}
      ${state.customWords.length > 0 && state.customWords.length < CUSTOM_MIN_WORDS ? `<p class="hint">${CUSTOM_MIN_WORDS - state.customWords.length} more word${CUSTOM_MIN_WORDS - state.customWords.length === 1 ? '' : 's'} to make this topic playable.</p>` : ''}
    </div>
    <div class="card">
      <h2 class="section-title">Round time</h2>
      <div class="chips">${timeChips}</div>
    </div>
    <div class="card">
      <h2 class="section-title">Each player draws</h2>
      <div class="chips">${roundChips}</div>
      <p class="hint">${totalRounds ? `${totalRounds} rounds total — every player draws ${s.roundsEach}×.` : 'Play freely and end the game whenever you like.'}</p>
    </div>
    <button class="btn primary big" data-action="start-game" ${canStart ? '' : 'disabled'}>
      ${canStart
        ? '🚀 Start game'
        : needsCustomWords
          ? `Add at least ${CUSTOM_MIN_WORDS} custom words to play "My Words"`
          : 'Add at least 2 players to start'}
    </button>
  </div>`;
}

/* ---------- game phases ---------- */

function handoffHtml(g) {
  const drawer = g.players[g.drawerPos];
  return `<div class="card stage">
    <div class="big-emoji">🤫</div>
    <h2>Pass the iPad to</h2>
    <div class="row" style="justify-content:center;margin:10px 0">
      ${avatarHtml(drawer.name, g.drawerPos)}
      <span style="font-size:30px;font-weight:900">${esc(drawer.name)}</span>
    </div>
    <p class="subtle">Only ${esc(drawer.name)} should see the next word!</p>
    <button class="btn primary big" data-action="to-reveal">👀 Show me the word</button>
  </div>
  <div class="card">
    <h2 class="section-title">Scoreboard</h2>
    ${scoreListHtml(g.players, { drawerId: drawer.id })}
  </div>`;
}

function revealHtml(g) {
  const drawer = g.players[g.drawerPos];
  return `<div class="card stage">
    <p class="subtle" style="margin-top:0">✏️ ${esc(drawer.name)}, your word is…</p>
    <div class="word-card">${esc(g.word)}</div>
    <p class="subtle">Don't let anyone else see! 😉</p>
    <button class="btn primary big" data-action="start-drawing">▶ Start drawing — ${Math.round(g.timer.duration / 1000)}s</button>
    <button class="btn ghost big" data-action="swap-word">🔄 Give me a different word</button>
  </div>`;
}

function drawingHtml(g) {
  const drawer = g.players[g.drawerPos];
  const guessers = g.players
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== g.drawerPos);
  return `<div class="game-drawing">
    <div class="card" style="text-align:center">
      <div class="drawer-flag">${avatarHtml(drawer.name, g.drawerPos)} ${esc(drawer.name)} is drawing</div>
      ${timerHtml(g)}
      <button class="peek-btn" data-peek id="peek-btn" aria-label="Hold to peek at the word">👁 Hold to peek word</button>
      <div class="row" style="justify-content:center">
        <button class="btn ghost" data-action="swap-word">🔄 Swap word</button>
        <button class="btn soft-danger" data-action="give-up">🏳️ Nobody got it</button>
      </div>
    </div>
    <div class="card">
      <h2 class="section-title">Who guessed it? Tap them!</h2>
      <div class="tiles">${guessers
        .map(
          ({ p, i }) => `<button class="tile" data-action="mark-correct" data-id="${p.id}">
            ${avatarHtml(p.name, i)}<span>${esc(p.name)}</span>
          </button>`
        )
        .join('')}</div>
    </div>
  </div>`;
}

function confettiHtml(count) {
  const pieces = Array.from({ length: count }, () => {
    const left = Math.random() * 100;
    const delay = Math.random() * 1.2;
    const dur = 2.8 + Math.random() * 2.5;
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    return `<span style="left:${left.toFixed(1)}vw;background:${color};animation-duration:${dur.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s"></span>`;
  }).join('');
  return `<div class="confetti" aria-hidden="true">${pieces}</div>`;
}

function resultHtml(g) {
  const r = g.result;
  const drawer = g.players[g.drawerPos];
  const isLast = g.totalRounds && g.round >= g.totalRounds;
  let emoji;
  let headline;
  let sub;
  if (r.type === 'correct') {
    const winner = g.players.find((p) => p.id === r.winnerId);
    emoji = '🎉';
    headline = `${winner ? esc(winner.name) : 'Someone'} guessed it!`;
    sub = `+1 ${winner ? esc(winner.name) : ''} · +1 ${esc(drawer.name)} (drawer)`;
  } else if (r.type === 'timeout') {
    emoji = '⏰';
    headline = "Time's up!";
    sub = 'No points this round.';
  } else {
    emoji = '🏳️';
    headline = 'Round skipped';
    sub = 'No points this round.';
  }
  return `${r.type === 'correct' ? confettiHtml(28) : ''}<div class="card stage">
    <div class="big-emoji">${emoji}</div>
    <h2>${headline}</h2>
    <p class="subtle">The word was</p>
    <div class="word-card" style="margin-top:6px">${esc(r.word)}</div>
    <p class="subtle">${sub}</p>
    <button class="btn primary big" data-action="${isLast ? 'finish-game' : 'next-round'}">
      ${isLast ? '🏆 See final results' : '➡️ Next round'}
    </button>
    <div class="row" style="justify-content:center;margin-top:12px">
      ${r.deltas.length ? '<button class="btn ghost" data-action="undo">↩️ Undo (wrong tap)</button>' : ''}
      ${!g.totalRounds ? '<button class="btn soft-danger" data-action="finish-game">🏁 End game</button>' : ''}
    </div>
  </div>
  <div class="card">
    <h2 class="section-title">Scoreboard</h2>
    ${scoreListHtml(g.players, { deltas: r.deltas, drawerId: drawer.id })}
  </div>`;
}

function gameHtml() {
  const g = state.game;
  let body;
  if (g.phase === 'handoff') body = handoffHtml(g);
  else if (g.phase === 'reveal') body = revealHtml(g);
  else if (g.phase === 'drawing') body = drawingHtml(g);
  else body = resultHtml(g);
  return `<div class="wrap">${gameTopbarHtml(g)}${body}</div>${scoresOverlayHtml(g)}`;
}

function scoresOverlayHtml(g) {
  if (!state.ui.showScores) return '';
  return `<div class="overlay" data-action="close-scores-backdrop">
    <div class="modal">
      <div class="row" style="justify-content:space-between">
        <h3>🏆 Scoreboard</h3>
        <button class="pill" style="background:#eef2ff;color:#4338ca" data-action="toggle-scores">✕ Close</button>
      </div>
      ${scoreListHtml(g.players, { drawerId: g.players[g.drawerPos].id })}
    </div>
  </div>`;
}

/* ---------- final screen ---------- */

function finalHtml() {
  const g = state.game;
  const ranked = [...g.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === top);
  const winnerLine = winners.map((p) => esc(p.name)).join(' & ');
  const history = g.history || [];
  const recap = history
    .map((h) => {
      const outcome = h.type === 'correct'
        ? `🎉 ${esc(h.winner)}`
        : h.type === 'timeout' ? '⏰ nobody' : '🏳️ skipped';
      return `<div class="recap-row">
        <span class="r-num">${h.round}</span>
        <span class="r-word">${esc(h.word)}</span>
        <span class="r-meta">✏️ ${esc(h.drawer)}</span>
        <span class="r-meta">${outcome}</span>
      </div>`;
    })
    .join('');
  return `${confettiHtml(60)}
  <div class="wrap">
    <div class="topbar"><h1 class="title">🏁 Final Results</h1></div>
    <div class="winner-card">
      <div class="crown">👑</div>
      <div class="who">${winnerLine}</div>
      <div class="score">${winners.length > 1 ? "It's a tie at" : 'wins with'} ${top} point${top === 1 ? '' : 's'}!</div>
    </div>
    <div class="card">
      <h2 class="section-title">Standings</h2>
      ${scoreListHtml(g.players)}
    </div>
    ${recap ? `<div class="card">
      <h2 class="section-title">Word recap</h2>
      ${recap}
    </div>` : ''}
    <button class="btn primary big" data-action="play-again">🔁 Play again (same players)</button>
    <button class="btn ghost big" data-action="new-setup">⚙️ Back to setup</button>
  </div>`;
}

/* ===================== render ===================== */

let lastView = '';

function render() {
  const app = $('#app');
  let view;
  if (state.screen === 'setup') view = setupHtml();
  else if (state.screen === 'final') view = finalHtml();
  else view = gameHtml();
  app.innerHTML = view;

  const viewKey = state.screen + ':' + (state.game ? state.game.phase : '');
  if (viewKey !== lastView) {
    lastView = viewKey;
    window.scrollTo(0, 0);
  }

  if (state.ui.refocus) {
    state.ui.refocus = false;
    const input = $('#player-input');
    if (input) input.focus();
  }
  if (state.ui.refocusWord) {
    state.ui.refocusWord = false;
    const input = $('#word-input');
    if (input) input.focus();
  }
}

/* ===================== events ===================== */

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'add-player') {
    const input = $('#player-input');
    addPlayer(input ? input.value : '');
  } else if (form.dataset.form === 'add-word') {
    const input = $('#word-input');
    addCustomWord(input ? input.value : '');
  }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'remove-player':
      removePlayer(el.dataset.id);
      break;
    case 'remove-word':
      removeCustomWord(el.dataset.word);
      break;
    case 'set-topic':
      state.settings.topic = el.dataset.topic;
      saveSettings();
      render();
      break;
    case 'set-seconds':
      state.settings.seconds = Number(el.dataset.seconds);
      saveSettings();
      render();
      break;
    case 'set-rounds':
      state.settings.roundsEach = Number(el.dataset.rounds);
      saveSettings();
      render();
      break;
    case 'start-game':
      startGame();
      break;
    case 'resume-game':
      state.screen = 'game';
      keepAwake();
      render();
      break;
    case 'discard-game':
      state.game = null;
      store.del(K.game);
      render();
      break;
    case 'to-reveal':
      toReveal();
      break;
    case 'swap-word':
      swapWord();
      break;
    case 'start-drawing':
      startDrawing();
      break;
    case 'toggle-pause':
      togglePause();
      break;
    case 'mark-correct':
      endRound('correct', el.dataset.id);
      break;
    case 'give-up':
      endRound('giveup');
      break;
    case 'undo':
      undoResult();
      break;
    case 'next-round':
      nextRound();
      break;
    case 'finish-game':
      finishGame();
      break;
    case 'play-again':
      playAgain();
      break;
    case 'new-setup':
      exitToSetup(true);
      break;
    case 'exit-game':
      if (window.confirm('Exit this game? You can resume it later from the setup screen.')) {
        exitToSetup(false);
      }
      break;
    case 'toggle-sound':
      sound.toggle();
      render();
      break;
    case 'toggle-scores':
      state.ui.showScores = !state.ui.showScores;
      render();
      break;
    case 'close-scores-backdrop':
      if (e.target === el) {
        state.ui.showScores = false;
        render();
      }
      break;
  }
});

/* Hold-to-peek: show the word only while the button is pressed. */
function setPeek(on) {
  const btn = $('#peek-btn');
  if (!btn || !state.game) return;
  btn.classList.toggle('peeking', on);
  btn.textContent = on ? state.game.word : '👁 Hold to peek word';
}

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-peek]')) setPeek(true);
});
['pointerup', 'pointercancel'].forEach((ev) =>
  document.addEventListener(ev, () => setPeek(false))
);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-peek]')) e.preventDefault();
});

/* ===================== boot ===================== */

// Offline support: cache the app so it works with no internet at the party.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* e.g. file:// */ });
  });
}

render();
