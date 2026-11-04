import labelRevisions from "./word-label-revisions.json" with { type: "json" };
import esMX from "./locales/es-MX.json" with { type: "json" };
import esES from "./locales/es-ES.json" with { type: "json" };
import ptPT from "./locales/pt-PT.json" with { type: "json" };
import ptBR from "./locales/pt-BR.json" with { type: "json" };
import enGB from "./locales/en-GB.json" with { type: "json" };
import enUS from "./locales/en-US.json" with { type: "json" };
import legacyLabels from "./legacy-word-labels.json" with { type: "json" };
import it from "./locales/it.json" with { type: "json" };
import de from "./locales/de.json" with { type: "json" };
import ko from "./locales/ko.json" with { type: "json" };
import ja from "./locales/ja.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import zh from "./locales/zh.json" with { type: "json" };
import zhTW from "./locales/zh-TW.json" with { type: "json" };
import zhHans from "./locales/zh-Hans.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import ar from "./locales/ar.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import pt from "./locales/pt.json" with { type: "json" };
import { cardLanguages } from "./languages.mjs";
export const catalogs = {
  "es-MX": esMX,
  "es-ES": esES,
  "pt-PT": ptPT,
  "pt-BR": ptBR,
  "en-GB": enGB,
  "en-US": enUS,
  en,
  zh,
  "zh-Hans": zhHans,
  "zh-TW": zhTW,
  ja,
  ko,
  de,
  fr,
  es,
  pt,
  it,
  ar,
};
export const localizedCopy = (locale, section) =>
  (Object.hasOwn(catalogs, locale) ? catalogs[locale] : en)[section];
export function cardLines(word, selection) {
  if (!word) return [];
  const codes = cardLanguages(selection);
  // New editions opt in explicitly. Old saves keep historical catalogs verbatim.
  const edition = typeof word.labelRevision === "string" && Object.hasOwn(labelRevisions, word.labelRevision)
    ? labelRevisions[word.labelRevision] : null;
  const revised = edition && Object.hasOwn(edition, word.id) ? edition[word.id] : null;
  if (revised && word.en === revised.en && word.zh === revised.zh && !word.id.startsWith("custom:"))
    return codes.map(code => ({code, text: revised[code] || word.en, original: !revised[code]}));

  // Stored custom/legacy text is never replaced by a dictionary guess.
  const builtin =
    (en.words[word.id] === word.en && zh.words[word.id] === word.zh) ||
    (legacyLabels[word.id]?.en === word.en &&
      legacyLabels[word.id]?.zh === word.zh);
  const result = [];
  for (const code of codes) {
    const text =
      code === "en"
        ? word.en
        : code === "zh"
          ? word.zh
          : builtin
            ? catalogs[code]?.words[word.id]
            : null;
    if (text) result.push({ code, text, original: false });
  }
  if (!result.length || (!builtin && word.id?.startsWith("custom:"))) {
    const text = word.en || word.zh || "";
    return text ? [{ code: "", text, original: true }] : [];
  }
  // An old unavailable translation is shown explicitly as original text, once.
  if (result.length < codes.length && !result.some((x) => x.text === word.en))
    result.push({ code: "", text: word.en, original: true });
  return result;
}
