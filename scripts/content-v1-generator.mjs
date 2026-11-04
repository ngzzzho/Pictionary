// Build metadata from preserved legacy source; no network/model calls.
import fs from "node:fs";
import vm from "node:vm";
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync("js/words.js", "utf8") +
    ";this.bank=WORD_BANK;this.zh=WORD_ZH;",
  context,
);
const easy = new Set(
  "dog|cat|rabbit|mouse|bear|panda|monkey|elephant|giraffe|zebra|lion|tiger|horse|cow|sheep|pig|chicken|duck|owl|parrot|penguin|snake|turtle|frog|dinosaur|dragon|unicorn|shark|whale|dolphin|octopus|crab|starfish|snail|butterfly|bee|ant|spider|worm|doctor|nurse|teacher|astronaut|firefighter|chef|farmer|singer|clown|pirate|soccer|basketball|tennis|bowling|running|cycling|swimming|fishing|jump rope|pizza|hamburger|hot dog|french fries|sandwich|fried egg|noodles|dumpling|egg tart|pineapple bun|donut|cookie|birthday cake|candy|lollipop|ice cream|popcorn|cheese|bread|apple|banana|orange|grapes|watermelon|strawberry|cherry|pineapple|pear|lemon|carrot|corn|mushroom|pumpkin|milk|chair|table|bed|pillow|lamp|clock|window|door|key|umbrella|backpack|book|pencil|eraser|ruler|scissors|crayon|phone|camera|robot|candle|fan|cup|plate|bowl|fork|spoon|bottle|toothbrush|comb|glasses|hat|shoes|socks|watch|ring|coin|piggy bank|teddy bear|doll|balloon|kite|ball|swing|slide|car|bus|taxi|train|airplane|rocket|boat|bicycle|traffic light|ladder|broom|bucket|hammer|tent|crown|trophy|present|toilet|egg waffle|fishball|minibus|double-decker bus|ferris wheel|sneezing|crying|laughing|brushing teeth|sleeping|clapping|waving|dancing|singing|jumping|cooking|hugging|washing hands|sun|moon|star|rainbow|cloud|rain|lightning|snowman|mountain|river|tree|leaf|flower|grass|rock|fire|red packet|lantern|Christmas tree|Santa Claus|ghost|party hat|mermaid|witch|fairy|castle|princess|king|queen".split(
    "|",
  ),
);
const held = new Set([
  "Star Ferry",
  "Peak Tram",
  "MTR",
  "Octopus card",
  "Ocean Park",
  "Disneyland",
  "Bruce Lee",
  "youtuber",
  "Peter Pan",
]);
const labels = {
  animals: "動物",
  occupations: "職業",
  sports: "運動",
  food: "食物",
  things: "日常物品",
  hongkong: "香港",
  cartoons: "卡通",
  actions: "動作",
  nature: "大自然",
  festivals: "節日",
  fairytales: "童話",
};
const words = Object.entries(context.bank).flatMap(([topic, t]) =>
  t.words.map((en) => ({
    id: `w:${topic}:${en.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    en,
    zh: context.zh[en] || "",
    topic,
    difficulty: easy.has(en) ? "easy" : "general",
    region: topic === "hongkong" ? "HK" : "global",
    review: topic === "cartoons" || held.has(en) ? "held" : "candidate",
  })),
);
const overrides = JSON.parse(
  fs.readFileSync("scripts/content-overrides.json", "utf8"),
);
for (const [id, fix] of Object.entries(overrides)) {
  const word = words.find((w) => w.id === id);
  if (!word) throw new Error(`Unknown content override ${id}`);
  if (fix.zh) word.zh = fix.zh;
  if (fix.difficulty) word.difficulty = fix.difficulty;
}
const collections = JSON.parse(
  fs.readFileSync("scripts/content-collections.json", "utf8"),
);
for (const [key, collection] of Object.entries(collections)) {
  if (
    new Set(collection.wordIds).size !== collection.wordIds.length ||
    collection.wordIds.some(
      (id) => !words.some((w) => w.id === id && w.review !== "held"),
    )
  )
    throw new Error(`Invalid collection ${key}`);
}
fs.writeFileSync(
  "js/content.json",
  JSON.stringify(
    {
      topics: Object.fromEntries(
        Object.entries(context.bank).map(([key, t]) => [
          key,
          { en: t.label, zh: labels[key], emoji: t.emoji },
        ]),
      ),
      collections,
      words,
    },
    null,
    2,
  ) + "\n",
);
console.log({
  total: words.length,
  active: words.filter((w) => w.review !== "held").length,
  easy: words.filter((w) => w.review !== "held" && w.difficulty === "easy")
    .length,
});
