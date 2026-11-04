import { scheduleFor } from "./core.mjs";
// Fixed, editorially selected concepts. Translations never count as extra cards.
export const FREE_WORD_IDS = Object.freeze([
  "w:animals:dog",
  "w:animals:cat",
  "w:animals:elephant",
  "w:animals:giraffe",
  "w:animals:panda",
  "w:animals:kangaroo",
  "w:animals:hedgehog",
  "w:food:pizza",
  "w:food:hamburger",
  "w:food:fried-egg",
  "w:food:birthday-cake",
  "w:food:lollipop",
  "w:food:sushi",
  "w:food:spaghetti",
  "w:things:chair",
  "w:things:bed",
  "w:things:umbrella",
  "w:things:clock",
  "w:things:pillow",
  "w:things:mirror",
  "w:things:pencil",
  "w:things:scissors",
  "w:things:camera",
  "w:things:kite",
  "w:things:ruler",
  "w:things:playing-cards",
  "w:sports:basketball",
  "w:sports:bowling",
  "w:sports:running",
  "w:sports:archery",
  "w:sports:tennis",
  "w:sports:golf",
  "w:occupations:astronaut",
  "w:occupations:firefighter",
  "w:occupations:chef",
  "w:occupations:doctor",
  "w:occupations:teacher",
  "w:occupations:farmer",
  "w:nature:sun",
  "w:nature:rainbow",
  "w:nature:volcano",
  "w:nature:cactus",
  "w:nature:waterfall",
  "w:nature:island",
  "w:things:car",
  "w:things:airplane",
  "w:things:bicycle",
  "w:things:rocket",
  "w:things:ambulance",
  "w:things:digger",
]);
export function freeDeck(content) {
  const words = new Map(
    content.words.filter((w) => w.review !== "held").map((w) => [w.id, w]),
  );
  if (FREE_WORD_IDS.some((id) => !words.has(id)))
    throw new Error("Free selection requires editorial review");
  return FREE_WORD_IDS.map((id) => words.get(id));
}
export function freeSettings(settings, players) {
  const roundsEach = [10, 5, 3, 2, 1].find(n =>
    n <= settings.roundsEach && scheduleFor(players, settings.mode, n).length * 2 <= 50
  ) || 1;
  return {
    ...settings,
    topic: "mixed",
    difficulty: "general",
    roundsEach,
    drawPolicy: "unique",
  };
}
