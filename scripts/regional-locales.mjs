import fs from "node:fs";
import assert from "node:assert/strict";
export function addRegionalCatalogs(catalogs) {
  for (const code of [
    "zh-TW",
    "en-US",
    "en-GB",
    "pt-BR",
    "pt-PT",
    "es-ES",
    "es-MX",
  ]) {
    const policy = JSON.parse(
      fs.readFileSync(
        new URL(`./regional-${code}.json`, import.meta.url),
        "utf8",
      ),
    );
    const base = catalogs[policy.base];
    assert.deepEqual(
      Object.keys(policy.words).sort(),
      Object.keys(base.words).sort(),
      "Every shipped concept requires a regional decision",
    );
    const regional = structuredClone(base);
    for (const [id, { source, text }] of Object.entries(policy.words)) {
      assert.equal(
        base.words[id],
        source,
        `Regional source changed: ${id}; review required`,
      );
      assert.ok(typeof text === "string" && text.trim());
      regional.words[id] = text;
    }
    for (const [section, values] of Object.entries(policy.copy)) {
      for (const [key, value] of Object.entries(values)) {
        assert.ok(
          Object.hasOwn(base[section], key),
          `Unknown regional copy ${section}.${key}`,
        );
        regional[section][key] = value;
      }
    }
    catalogs[policy.code] = regional;
  }
  return catalogs;
}
