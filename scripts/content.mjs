// Deterministic editorial build. The historical source and shipped IDs stay intact.
import fs from "node:fs";
import { applyLanguageReview } from "./content-language-review.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { locales as allLocales } from "../js/languages.mjs";
import { addRegionalCatalogs } from "./regional-locales.mjs";
const locales = allLocales.filter((l) => !l.baseLocale);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const baseline = read("scripts/content-v1-baseline.json");
const review = read("scripts/content-v2-legacy-review.json");
const additions = [
  ...read("scripts/content-v2-additions-a.json"),
  ...read("scripts/content-v2-additions-b.json"),
];
const patches = read("scripts/content-v2-ui.json");
const mainstream = read("scripts/content-mainstream-policy.json");
const mainstreamCopy = read("scripts/content-mainstream-ui.json");
const practical = read("scripts/content-playability-review.json");
const practicalCopy = read("scripts/content-playability-ui.json");
const twoLevel = read("scripts/content-two-level-policy.json");
const twoLevelCopy = read("scripts/content-two-level-ui.json");
const topicPolicy = read("scripts/content-topic-policy.json");
const topicBaseline = read(topicPolicy.baselineFile);
const topicAdditions = read("scripts/content-topic-additions.json");
const topicCopy = read("scripts/content-topic-ui.json");
const depthPolicy = read("scripts/content-depth-policy.json");
const depthBaseline = read(depthPolicy.baselineFile);
const depthAdditions = read("scripts/content-depth-additions.json");
const depthCopy = read("scripts/content-depth-ui.json");
assert.equal(
  createHash("sha256")
    .update(fs.readFileSync(depthPolicy.baselineFile))
    .digest("hex"),
  depthPolicy.inputSHA256,
);
assert.equal(
  createHash("sha256")
    .update(fs.readFileSync(topicPolicy.baselineFile))
    .digest("hex"),
  topicPolicy.inputSHA256,
);
const keys = [
  "animals",
  "food",
  "things",
  "actions",
  "sports",
  "occupations",
  "nature",
  "transport",
  "places",
  "science",
  "fantasy",
  "celebrations",
];
const levels = ["easy", "medium", "hard", "expert"];
const previous = baseline.words.filter((w) => w.review !== "held");
assert.equal(
  additions.length,
  420,
  "420 independently edited additions required",
);
assert.deepEqual(
  review.entries.map((w) => w.id).sort(),
  previous.map((w) => w.id).sort(),
  "Every shipped concept must have a review",
);
const edits = new Map(review.entries.map((w) => [w.id, w]));
const words = baseline.words.map((w) =>
  edits.has(w.id)
    ? {
        ...w,
        ...edits.get(w.id),
        region: "global",
        tags: [],
        intent: review.labelFixes[w.id]?.intent || w.en,
      }
    : w,
);
for (const a of additions) {
  assert.match(a.id, /^n:[a-z0-9-]+$/);
  assert.ok(a.intent?.trim());
  assert.deepEqual(
    Object.keys(a.labels).sort(),
    locales.map((l) => l.code).sort(),
  );
  words.push({
    id: a.id,
    en: a.labels.en,
    zh: a.labels.zh,
    topic: a.topic,
    difficulty: a.difficulty,
    region: "global",
    review: "candidate",
    starter: a.starter,
    tags: a.tags,
    intent: a.intent,
  });
}
assert.equal(
  new Set(words.map((w) => w.id)).size,
  words.length,
  "Stable unique IDs",
);
const catalogs = Object.fromEntries(
  locales.map(({ code }) => [code, read(`js/locales/${code}.json`)]),
);
for (const [code, c] of Object.entries(catalogs)) {
  c.words = Object.fromEntries(previous.map((w) => [w.id, c.words[w.id]]));
  Object.assign(
    c.ui,
    patches[code].ui,
    mainstreamCopy[code].ui,
    practicalCopy[code],
    twoLevelCopy[code],
  );
  Object.assign(c.topics, patches[code].topics);
  for (const [id, fix] of Object.entries(review.labelFixes)) {
    assert.ok(edits.has(id), `Unknown fix ${id}`);
    assert.ok(fix.labels[code]?.trim());
    c.words[id] = fix.labels[code];
  }
  for (const a of additions) c.words[a.id] = a.labels[code];
}
for (const w of words)
  if (edits.has(w.id)) {
    w.en = catalogs.en.words[w.id];
    w.zh = catalogs.zh.words[w.id];
  }
// Park prompts reversibly. Labels/IDs remain available to historical games.
assert.equal(words.filter((w) => w.review !== "held").length, 1013);
for (const id of Object.keys(mainstream.extraHeld))
  assert.ok(
    words.some((w) => w.id === id && w.review !== "held"),
    `Unknown parked ID ${id}`,
  );
let parked = 0;
for (const w of words) {
  if (w.review === "held") continue;
  if (
    w.tags.some((tag) => mainstream.parkTags.includes(tag)) ||
    mainstream.parkDifficulties.includes(w.difficulty) ||
    Object.hasOwn(mainstream.extraHeld, w.id)
  ) {
    w.review = "held";
    w.heldReason =
      mainstream.extraHeld[w.id] ||
      "Silly and expert decks are paused for the mainstream-first release.";
    parked++;
  }
}
const mainstreamActive = words.filter((w) => w.review !== "held");
assert.equal(mainstreamActive.length, mainstream.expectedActive);
assert.equal(parked, mainstream.expectedParked);
// Every previously active card needs an explicit drawing/guessing judgement.
// The review is bound to its exact inputs; no new or formerly held word can
// enter the pool through this editorial pass.
const basis = mainstreamActive.map((w) => [
  w.id,
  w.en,
  w.zh,
  w.topic,
  w.difficulty,
  w.starter,
]);
assert.equal(
  createHash("sha256").update(JSON.stringify(basis)).digest("hex"),
  practical.inputSHA256,
);
assert.equal(practical.entries.length, mainstreamActive.length);
assert.deepEqual(
  practical.entries.map((e) => e.id).sort(),
  mainstreamActive.map((w) => w.id).sort(),
);
const decisions = new Map(practical.entries.map((e) => [e.id, e]));
for (const w of mainstreamActive) {
  const e = decisions.get(w.id);
  assert.ok(
    ["keep", "hold"].includes(e.decision) && e.reason?.trim(),
    `Missing judgement ${w.id}`,
  );
  if (e.decision === "hold") {
    w.review = "held";
    w.heldReason = e.reason;
  } else {
    assert.ok(
      ["easy", "medium", "hard"].includes(e.difficulty) && e.drawCue?.trim(),
      `Missing draw cue ${w.id}`,
    );
    assert.equal(typeof e.starter, "boolean");
    assert.ok(!e.starter || e.difficulty === "easy");
    w.difficulty = e.difficulty;
    w.starter = e.starter;
  }
}
const practicalActive = words.filter((w) => w.review !== "held");
assert.equal(practicalActive.length, practical.expectedActive);
assert.equal(practicalActive.length, twoLevel.expectedInput);
const twoLevelBasis = practicalActive.map((w) => [
  w.id,
  w.en,
  w.zh,
  w.topic,
  w.difficulty,
  w.starter,
]);
assert.equal(
  createHash("sha256").update(JSON.stringify(twoLevelBasis)).digest("hex"),
  twoLevel.inputSHA256,
);
assert.equal(
  new Set(twoLevel.entries.map((e) => e.id)).size,
  twoLevel.entries.length,
);
for (const e of twoLevel.entries) {
  const w = practicalActive.find((word) => word.id === e.id);
  assert.ok(w && e.reason?.trim(), `Unknown two-level decision ${e.id}`);
  assert.equal(w.difficulty, e.previousDifficulty);
  if (e.decision === "hold") {
    w.review = "held";
    w.heldReason = e.reason;
  } else {
    assert.equal(e.decision, "standard");
    assert.equal(w.difficulty, "hard");
    w.difficulty = "medium";
    w.starter = false;
  }
}
assert.equal(
  twoLevel.entries.filter((e) => e.decision === "hold").length,
  twoLevel.expectedHeld,
);
assert.equal(
  twoLevel.entries.filter((e) => e.decision === "standard").length,
  twoLevel.expectedRegraded,
);
let active = words.filter((w) => w.review !== "held");
assert.equal(active.length, twoLevel.expectedActive);
for (const w of active) {
  assert.ok(keys.includes(w.topic), `Invalid topic ${w.id}`);
  assert.ok(["easy", "medium"].includes(w.difficulty), `Invalid level ${w.id}`);
  assert.equal(typeof w.starter, "boolean");
  assert.ok(!w.starter || w.difficulty === "easy");
  assert.ok(Array.isArray(w.tags) && w.tags.every((t) => t === "silly"));
}
// A new editorial layer never changes the historical reviews or unholds cards.
assert.deepEqual(words, topicBaseline.words);
assert.equal(active.length, topicPolicy.expectedInputActive);
assert.equal(words.length - active.length, topicPolicy.expectedInputHeld);
for (const w of active) {
  w.topic = topicPolicy.wordTopics[w.id] || topicPolicy.baseTopicMap[w.topic];
  assert.ok(
    topicPolicy.keys.includes(w.topic),
    `Unmapped active topic ${w.id}`,
  );
}
const normalized = (text) => text.normalize("NFKC").trim().toLocaleLowerCase();
const oldEnglish = new Set(words.map((w) => normalized(w.en)));
const oldChinese = new Set(words.map((w) => normalized(w.zh)).filter(Boolean));
assert.equal(topicAdditions.length, topicPolicy.expectedAdditions);
for (const a of topicAdditions) {
  assert.match(a.id, /^n:[a-z0-9-]+$/);
  assert.ok(!words.some((w) => w.id === a.id), `Reused ID ${a.id}`);
  assert.ok(a.intent?.trim() && a.drawCue?.trim() && a.reason?.trim());
  assert.ok(["easy", "medium"].includes(a.difficulty));
  assert.equal(a.starter, a.difficulty === "easy");
  assert.deepEqual(
    Object.keys(a.labels).sort(),
    locales.map((l) => l.code).sort(),
  );
  assert.ok(
    !oldEnglish.has(normalized(a.labels.en)),
    `Old English concept ${a.id}`,
  );
  assert.ok(
    !oldChinese.has(normalized(a.labels.zh)),
    `Old Chinese concept ${a.id}`,
  );
  const topic = topicPolicy.baseTopicMap[a.topic] || a.topic;
  assert.ok(topicPolicy.keys.includes(topic));
  words.push({
    id: a.id,
    en: a.labels.en,
    zh: a.labels.zh,
    topic,
    difficulty: a.difficulty,
    region: "global",
    review: "candidate",
    starter: a.starter,
    tags: [],
    intent: a.intent,
  });
}
for (const [code, c] of Object.entries(catalogs)) {
  Object.assign(c.ui, topicCopy[code].ui);
  Object.assign(c.topics, topicCopy[code].topics);
  for (const a of topicAdditions) c.words[a.id] = a.labels[code];
}
active = words.filter((w) => w.review !== "held");
assert.deepEqual(
  words.filter((w) => w.review === "held"),
  topicBaseline.words.filter((w) => w.review === "held"),
);
for (const key of topicPolicy.keys)
  assert.ok(
    active.filter((w) => w.topic === key).length >=
      topicPolicy.minimumTopicSize,
    `Thin standalone topic ${key}`,
  );
// Grow reviewed pools without rewriting past editorial choices or saved words.
assert.deepEqual(words, depthBaseline.words);
assert.equal(active.length, depthPolicy.expectedInputActive);
for (const w of active) {
  w.topic = depthPolicy.wordTopics[w.id] || w.topic;
  assert.ok(depthPolicy.keys.includes(w.topic), `Unmapped depth topic ${w.id}`);
}
const priorEnglish = new Set(words.map((w) => normalized(w.en)));
const priorChinese = new Set(
  words.map((w) => normalized(w.zh)).filter(Boolean),
);
assert.equal(depthAdditions.length, depthPolicy.expectedAdditions);
for (const a of depthAdditions) {
  assert.match(a.id, /^n:[a-z0-9-]+$/);
  assert.ok(!words.some((w) => w.id === a.id), `Reused depth ID ${a.id}`);
  assert.ok(a.intent?.trim() && a.drawCue?.trim() && a.reason?.trim());
  assert.ok(a.nearestConfusion?.trim(), `Missing comparison ${a.id}`);
  assert.ok(["easy", "medium"].includes(a.difficulty));
  assert.equal(a.starter, a.difficulty === "easy");
  assert.ok(depthPolicy.keys.includes(a.topic), `Invalid depth topic ${a.id}`);
  assert.deepEqual(
    Object.keys(a.labels).sort(),
    locales.map((l) => l.code).sort(),
  );
  assert.ok(
    !priorEnglish.has(normalized(a.labels.en)),
    `Old English concept ${a.id}`,
  );
  assert.ok(
    !priorChinese.has(normalized(a.labels.zh)),
    `Old Chinese concept ${a.id}`,
  );
  words.push({
    id: a.id,
    en: a.labels.en,
    zh: a.labels.zh,
    topic: a.topic,
    difficulty: a.difficulty,
    region: "global",
    review: "candidate",
    starter: a.starter,
    tags: [],
    intent: a.intent,
  });
}
for (const [code, c] of Object.entries(catalogs)) {
  Object.assign(c.topics, depthCopy[code]);
  for (const a of depthAdditions) c.words[a.id] = a.labels[code];
}
active = words.filter((w) => w.review !== "held");
assert.deepEqual(
  words.filter((w) => w.review === "held"),
  depthBaseline.words.filter((w) => w.review === "held"),
);
for (const key of depthPolicy.keys)
  assert.ok(
    active.filter((w) => w.topic === key).length >=
      depthPolicy.minimumTopicCounts[key],
    `Insufficient reviewed depth for ${key}`,
  );
for (const value of Object.values(depthPolicy.topicAliases))
  assert.ok(
    value.split("+").every((key) => depthPolicy.keys.includes(key)),
    `Alias must resolve directly to current subjects: ${value}`,
  );
addRegionalCatalogs(catalogs);
// Exact label homonyms defeat a drawing game's promise of distinct answers.
for (const [code, c] of Object.entries(catalogs)) {
  const seen = new Map();
  for (const w of active) {
    const text = c.words[w.id];
    assert.ok(
      typeof text === "string" && text.trim() && text.length <= 120,
      `${code}:${w.id}`,
    );
    const norm = text.normalize("NFKC").trim().toLocaleLowerCase();
    assert.ok(
      !seen.has(norm),
      `Duplicate ${code} label '${text}': ${seen.get(norm)} / ${w.id}`,
    );
    seen.set(norm, w.id);
  }
}
const topics = Object.fromEntries(
  depthPolicy.keys.map((k) => [
    k,
    { en: catalogs.en.topics[k], zh: catalogs.zh.topics[k] },
  ]),
);
const filters = {
  starter: (w) => w.starter,
};
const presets = { starter: "easy" };
const collections = Object.fromEntries(
  Object.entries(filters).map(([k, filter]) => [
    k,
    {
      en: catalogs.en.topics[k],
      zh: catalogs.zh.topics[k],
      difficulty: presets[k],
      wordIds: active.filter(filter).map((w) => w.id),
    },
  ]),
);
for (const c of Object.values(collections))
  assert.ok(
    c.wordIds.length >= 36,
    "Every playlist supports the largest standard game",
  );
// Write only after every input and collision check has passed.
write("js/content.json", applyLanguageReview({
  edition: depthPolicy.edition,
  selectionPolicy: depthPolicy.selectionPolicy,
  // Includes parked cards so an update cannot drop old save translations.
  shippedWordIds: [
    ...previous,
    ...additions,
    ...topicAdditions,
    ...depthAdditions,
  ].map((w) => w.id),
  topics,
  topicAliases: depthPolicy.topicAliases,
  collections,
  words,
}));
for (const [code, c] of Object.entries(catalogs))
  write(`js/locales/${code}.json`, c);
console.log(
  JSON.stringify(
    {
      total: words.length,
      active: active.length,
      held: words.length - active.length,
      topics: Object.fromEntries(
        depthPolicy.keys.map((t) => [
          t,
          active.filter((w) => w.topic === t).length,
        ]),
      ),
      difficulty: Object.fromEntries(
        levels.map((d) => [d, active.filter((w) => w.difficulty === d).length]),
      ),
      playlists: Object.fromEntries(
        Object.entries(collections).map(([k, c]) => [k, c.wordIds.length]),
      ),
      locales: allLocales.length,
    },
    null,
    2,
  ),
);
