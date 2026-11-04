// Pure future-game selection. Resuming a saved game never uses these filters.
export const difficultyKeys = ["easy", "medium", "general"];
const aliases = {
  hongkong: "mixed",
  silly: "mixed",
  challenge: "mixed",
  fairytales: "fantasy",
  festivals: "celebrations",
  cartoons: "fantasy",
  space: "science",
};
export function resolveTopic(content, value) {
  // Composite selections never silently widen to all topics. Historical single
  // keys retain their established fallback, while retired subjects map forward.
  if (typeof value !== "string") return "mixed";
  const resolveSingle = (key) => {
    const alias = Object.hasOwn(aliases, key) ? aliases[key] : key;
    return Object.hasOwn(content.topicAliases || {}, alias)
      ? content.topicAliases[alias]
      : alias;
  };
  const parts = value.split("+");
  if (parts.length > 16 || (value.includes("+") && parts.some((key) => !key)))
    return "unavailable";
  // A retired broad subject may split into several current subjects. Expand
  // its alias inside an existing union too, preserving future-game scope.
  const keys = [
    ...new Set(parts.flatMap((key) => resolveSingle(key).split("+"))),
  ];
  if (value.includes("+") || keys.length > 1) {
    if (keys.some((key) => !Object.hasOwn(content.topics, key)))
      return "unavailable";
    return Object.keys(content.topics)
      .filter((key) => keys.includes(key))
      .join("+");
  }
  const key = keys[0];
  if (key === "unavailable") return key;
  return key === "mixed" ||
    key === "custom" ||
    Object.hasOwn(content.topics, key) ||
    Object.hasOwn(content.collections || {}, key)
    ? key
    : "mixed";
}
export function selectedTopics(content, value) {
  const topic = resolveTopic(content, value);
  return topic.split("+").filter((key) => Object.hasOwn(content.topics, key));
}
export function toggleTopic(content, value, key) {
  if (!Object.hasOwn(content.topics, key)) return resolveTopic(content, value);
  const selected = selectedTopics(content, value);
  if (selected.includes(key)) {
    if (selected.length === 1) return selected[0];
    return resolveTopic(content, selected.filter((k) => k !== key).join("+"));
  }
  return resolveTopic(content, [...selected, key].join("+"));
}
export const resolveDifficulty = (value) =>
  value === "hard"
    ? "medium"
    : difficultyKeys.includes(value)
      ? value
      : "general";
export const isPausedSelection = (settings) =>
  settings.topic === "silly" ||
  settings.topic === "challenge" ||
  settings.difficulty === "expert" ||
  settings.difficulty === "hard";
// Replay starts a new game. Resuming an existing game never uses this filter.
export function eligibleReplayDeck(
  content,
  deck,
  settings = { topic: "mixed", difficulty: "general" },
) {
  const allowed = new Map(
    makeDeck(content, [], settings, false).map((w) => [w.id, w]),
  );
  // Replay is new play: current category/difficulty applies, even when a
  // historical card was assigned an easier level. Keep custom text verbatim.
  return deck.flatMap((w) =>
    w.id.startsWith("custom:")
      ? [w]
      : allowed.has(w.id)
        ? [allowed.get(w.id)]
        : [],
  );
}
export function makeDeck(
  content,
  custom,
  settings,
  includeCustom = true,
  extraLabels = () => [],
) {
  const topic = resolveTopic(content, settings.topic);
  const selected = new Set(selectedTopics(content, topic));
  const difficulty = resolveDifficulty(settings.difficulty);
  const built = content.words.filter(
    (w) =>
      w.review !== "held" &&
      (topic === "mixed" ||
        selected.has(w.topic) ||
        content.collections?.[topic]?.wordIds.includes(w.id)) &&
      (difficulty === "general" || w.difficulty === difficulty),
  );
  const own = custom.map((w) => ({
    id: `custom:${w.toLowerCase()}`,
    en: w,
    zh: "",
    topic: "custom",
    difficulty: "general",
    region: "custom",
  }));
  const candidates =
    topic === "custom"
      ? own
      : topic === "mixed" && includeCustom && difficulty === "general"
        ? [...built, ...own]
        : built;
  const seen = new Set(),
    visible = new Set(),
    ids = new Set();
  return candidates.filter((w) => {
    // A French homograph of an unrelated English label is not a collision.
    // Compare built-in labels within their stable language slot; custom text
    // remains literal and is excluded when it duplicates any visible label.
    const labels = [w.en, w.zh, ...extraLabels(w)].map((v) =>
      v ? v.normalize("NFKC").trim().toLocaleLowerCase() : "",
    );
    const own = w.id.startsWith("custom:");
    if (
      ids.has(w.id) ||
      labels.some((x, i) => x && (own ? visible.has(x) : seen.has(`${i}:${x}`)))
    )
      return false;
    ids.add(w.id);
    labels.forEach((x, i) => {
      if (x) {
        seen.add(`${i}:${x}`);
        visible.add(x);
      }
    });
    return true;
  });
}
export const topicChoices = (content, hasCustom) => [
  "mixed",
  ...Object.keys(content.topics),
  ...(hasCustom ? ["custom"] : []),
];

// Only future games require reselection; saved decks are never rewritten.
export const needsTopicReview = (value) => typeof value === "string" &&
  value.split("+").some(key => ["cartoons","fairytales","festivals","space","fantasy","celebrations","science"].includes(key));
