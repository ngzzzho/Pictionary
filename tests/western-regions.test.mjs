import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  locales,
  selectableLocales,
  detectLocale,
  cardLanguages,
} from "../js/languages.mjs";
import { catalogs, cardLines } from "../js/localization.mjs";
import { addRegionalCatalogs } from "../scripts/regional-locales.mjs";
import { makeDeck } from "../js/decks.mjs";
const content = JSON.parse(fs.readFileSync("js/content.json"));
const regions = ["en-US", "en-GB", "pt-BR", "pt-PT", "es-ES", "es-MX"];
test("six source-bound regional reviews cover every shipped ID without modifying legacy labels", () => {
  for (const code of regions) {
    const p = JSON.parse(fs.readFileSync(`scripts/regional-${code}.json`));
    assert.equal(Object.keys(p.words).length, 1185);
    for (const [id, record] of Object.entries(p.words)) {
      assert.equal(record.source, catalogs[p.base].words[id]);
      assert.equal(record.text, catalogs[code].words[id]);
      assert.ok(record.reason && record.review);
    }
    const bad = structuredClone(catalogs);
    bad[p.base].words["w:things:car"] = "new source";
    assert.throws(() => addRegionalCatalogs(bad));
  }
  assert.deepEqual(cardLanguages("both"), ["en", "zh"]);
  assert.equal(selectableLocales.length, 15);
  assert.equal(locales.length, 18);
  for (const code of ["en", "pt", "es"])
    assert.ok(!selectableLocales.some((l) => l.code === code));
});
test("regional selection and misleading cognates retain the same drawing concept", () => {
  const cases = [
    ["w:things:flashlight", "en-US", "flashlight", "en-GB", "torch"],
    ["n:aubergine", "en-US", "eggplant", "en-GB", "aubergine"],
    ["w:food:potato-chips", "en-US", "potato chips", "en-GB", "crisps"],
    ["w:things:bus", "pt-BR", "ônibus", "pt-PT", "autocarro"],
    ["w:things:refrigerator", "pt-BR", "geladeira", "pt-PT", "frigorífico"],
    ["w:things:straw", "es-ES", "pajita", "es-MX", "popote"],
    ["w:things:truck", "es-ES", "camión", "es-MX", "camión de carga"],
    ["w:food:lemon", "es-ES", "limón", "es-MX", "limón amarillo"],
  ];
  for (const [id, a, at, b, bt] of cases) {
    const word = content.words.find((w) => w.id === id);
    assert.deepEqual(
      cardLines(word, `${a}+${b}`).map((l) => l.text),
      [at, bt],
    );
  }
  assert.notEqual(
    catalogs["pt-PT"].words["w:sports:sumo-wrestling"],
    catalogs["pt-PT"].words["w:food:juice"],
  );
  for (const code of regions) {
    assert.equal(detectLocale([code]), code);
    assert.equal(detectLocale([code.replace("-", "_")]), code);
  }
  assert.equal(detectLocale(["es-AR"]), "es"); // no claim that Mexican vocabulary represents Argentina
  assert.deepEqual(
    cardLines({ id: "custom:camión", en: "camión", zh: "" }, "es-MX"),
    [{ code: "", text: "camión", original: true }],
  );
});
test("new regional labels preserve all built-in topic unions and difficulties", () => {
  for (const topic of [
    "mixed",
    ...Object.keys(content.topics),
    "food+occupations",
  ])
    for (const difficulty of ["easy", "medium", "general"]) {
      const args = [content, [], { topic, difficulty }, false];
      const before = makeDeck(...args, (w) =>
        locales
          .filter((l) => !regions.includes(l.code))
          .map((l) => catalogs[l.code].words[w.id]),
      );
      const after = makeDeck(...args, (w) =>
        locales.map((l) => catalogs[l.code].words[w.id]),
      );
      assert.deepEqual(
        after.map((w) => w.id),
        before.map((w) => w.id),
      );
    }
});
