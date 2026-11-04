import { teamGuessing, validTeamGuessing } from "./team-guessing.mjs";
import { validTeamNames } from "./team-names.mjs";
import { validLocale, validCardLanguages } from "./languages.mjs";
export const defaults = {
  mode: "individual",
  surface: "canvas",
  topic: "mixed",
  difficulty: "easy",
  cardLanguage: "both",
  seconds: 60,
  roundsEach: 2,
};
export const validProfile = (p) =>
  p &&
  p.version === 1 &&
  (p.onboardingSeen === undefined || typeof p.onboardingSeen === "boolean") &&
  validLocale(p.language) &&
  typeof p.muted === "boolean" &&
  Array.isArray(p.players) &&
  p.players.length <= 12 &&
  p.players.every(
    (x) =>
      typeof x.id === "string" &&
      typeof x.name === "string" &&
      x.name.length <= 40 &&
      [0, 1].includes(x.team),
  ) &&
  new Set(p.players.map((x) => x.id)).size === p.players.length &&
  Array.isArray(p.custom) &&
  p.custom.length <= 200 &&
  p.custom.every((x) => typeof x === "string" && x.length <= 60) &&
  p.settings &&
  validTeamGuessing(p.settings) &&
  validTeamNames(p.settings.teamNames) &&
  Object.keys(defaults).every(
    (k) => typeof p.settings[k] === typeof defaults[k],
  ) &&
  ["coop", "individual", "teams"].includes(p.settings.mode) &&
  ["canvas", "paper"].includes(p.settings.surface) &&
  ["easy", "medium", "hard", "expert", "general"].includes(
    p.settings.difficulty,
  ) &&
  validCardLanguages(p.settings.cardLanguage) &&
  [30, 60, 90, 120].includes(p.settings.seconds) &&
  [1, 2, 3, 5, 10].includes(p.settings.roundsEach);
