import assert from "node:assert/strict";
import { addRegionalCatalogs } from "./regional-locales.mjs";
import fs from "node:fs/promises";
import { locales } from "../js/languages.mjs";
const plain = (x) => x && typeof x === "object" && !Array.isArray(x);
export async function validateLocales() {
  const content = JSON.parse(await fs.readFile("js/content.json", "utf8"));
  const catalogs = Object.fromEntries(
    await Promise.all(
      locales.map(async ({ code }) => [
        code,
        JSON.parse(await fs.readFile(`js/locales/${code}.json`, "utf8")),
      ]),
    ),
  );
  const revisions = JSON.parse(await fs.readFile("js/word-label-revisions.json", "utf8"));
  const active = content.words.filter((w) => w.review !== "held");
  const legacy = JSON.parse(
    await fs.readFile("js/legacy-word-labels.json", "utf8"),
  );
  const shippedIds = new Set([
    ...(content.shippedWordIds || []),
    ...Object.keys(legacy),
    ...active.map((w) => w.id),
  ]);
  const base = catalogs.en;
  function verify(value, template, path) {
    if (typeof template === "string") {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 2400 ||
        /[<>\u202a-\u202e\u2066-\u2069]/u.test(value)
      )
        throw new Error(`Invalid translation: ${path}`);
      return;
    }
    if (
      !plain(value) ||
      Object.keys(value).sort().join("|") !==
        Object.keys(template).sort().join("|")
    )
      throw new Error(`Locale keys mismatch: ${path}`);
    for (const key of Object.keys(template))
      verify(value[key], template[key], `${path}.${key}`);
  }
  for (const { code } of locales) {
    verify(catalogs[code], base, code);
    if (
      Object.keys(catalogs[code].words).length !== shippedIds.size ||
      Object.keys(catalogs[code].words).some((id) => !shippedIds.has(id))
    )
      throw new Error(`Word coverage mismatch: ${code}`);
    for (const word of active) {
      const revised = revisions[word.labelRevision]?.[word.id];
      const text = revised ? revised[code] : catalogs[code].words[word.id];
      if (!text || text.length > 120)
        throw new Error(`Invalid word: ${code}.${word.id}`);
      if ((code === "en" || code === "zh") && text !== word[code])
        throw new Error(`Original word changed: ${code}.${word.id}`);
    }
  }
  for (const [revision, entries] of Object.entries(revisions))
    for (const [id, labels] of Object.entries(entries)) {
      assert.ok(shippedIds.has(id), `Unknown revision ID ${id}`);
      assert.deepEqual(Object.keys(labels).sort(), locales.map(l=>l.code).sort());
      for (const [code, text] of Object.entries(labels)) {
        verify(text, "", `${revision}.${id}.${code}`);
        assert.ok(text.length <= 120);
      }
    }
  const derived = addRegionalCatalogs(structuredClone(catalogs));
  assert.deepEqual(
    catalogs,
    derived,
    "Regional catalog stale; run node scripts/content.mjs",
  );
  return catalogs;
}
if (process.argv[1]?.endsWith("validate-locales.mjs")) {
  const c = await validateLocales();
  console.log(
    `Verified ${Object.keys(c).length} locales, ${Object.keys(c.en.words).length} shipped concepts per locale (including archived save translations)`,
  );
}
