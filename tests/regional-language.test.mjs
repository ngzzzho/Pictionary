import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  detectLocale,
  cardLanguages,
  encodeCardLanguages,
  locales,
} from "../js/languages.mjs";
import { cardLines, catalogs } from "../js/localization.mjs";
import { makeDeck } from "../js/decks.mjs";
import { addRegionalCatalogs } from "../scripts/regional-locales.mjs";
const content = JSON.parse(fs.readFileSync("js/content.json"));
test("HK and Taiwan detection, dual cards and legacy both preserve meaning", () => {
  for (const input of ["zh-TW", "zh-Hant-TW", "zh_Hant_TW"])
    assert.equal(detectLocale([input]), "zh-TW");
  for (const input of ["zh-HK", "zh-MO", "zh-Hant"])
    assert.equal(detectLocale([input]), "zh");
  assert.deepEqual(cardLanguages("both"), ["en", "zh"]);
  assert.equal(encodeCardLanguages(["zh", "zh-TW"]), "zh+zh-TW");
  for (const [id, hk, tw] of [
    ["w:things:taxi", "的士", "計程車"],
    ["w:sports:table-tennis", "乒乓球", "桌球"],
    ["w:sports:billiards", "桌球", "撞球"],
    ["n:traffic-cone", "雪糕筒", "交通錐"],
    ["w:actions:crying", "喊", "哭泣"],
    ["w:things:tram", "電車", "路面電車"],
  ]) {
    const word = content.words.find((w) => w.id === id),
      snapshot = JSON.stringify(word);
    assert.deepEqual(
      cardLines(word, "zh+zh-TW").map((l) => l.text),
      [hk, tw],
    );
    assert.equal(JSON.stringify(word), snapshot);
  }
  assert.deepEqual(
    cardLines({ id: "custom:的士", en: "的士", zh: "" }, "zh-TW"),
    [{ code: "", text: "的士", original: true }],
  );
});
test("regional variants do not shrink any topic/difficulty pool", () => {
  for (const topic of ["mixed", ...Object.keys(content.topics)])
    for (const difficulty of ["easy", "medium", "general"]) {
      const settings = { topic, difficulty };
      const before = makeDeck(content, [], settings, false, (w) =>
        locales
          .filter((l) => !l.baseLocale)
          .map((l) => catalogs[l.code].words[w.id]),
      );
      const after = makeDeck(content, [], settings, false, (w) =>
        locales.map((l) => catalogs[l.code].words[w.id]),
      );
      assert.deepEqual(
        after.map((w) => w.id),
        before.map((w) => w.id),
      );
    }
});
test("every shipped regional label is source-bound and cannot silently inherit new HK words", () => {
  const copy = structuredClone(catalogs);
  copy.zh.words["new-concept"] = "測試";
  assert.throws(() => addRegionalCatalogs(copy));
  const changed = structuredClone(catalogs);
  changed.zh.words["w:things:taxi"] = "不同意思";
  assert.throws(() => addRegionalCatalogs(changed));
  assert.deepEqual(
    addRegionalCatalogs(structuredClone(catalogs))["zh-TW"],
    catalogs["zh-TW"],
  );
});
