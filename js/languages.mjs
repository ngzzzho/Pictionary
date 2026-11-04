// Ten language families; Chinese offers both writing systems without renaming legacy zh.
export const locales = [
  {
    code: "en-US",
    name: "English (US)",
    tag: "en-US",
    dir: "ltr",
    family: "en",
    baseLocale: "en",
  },
  {
    code: "en-GB",
    name: "English (UK)",
    tag: "en-GB",
    dir: "ltr",
    family: "en",
    baseLocale: "en",
  },
  {
    code: "en",
    legacy: true,
    name: "English (original)",
    tag: "en",
    dir: "ltr",
    family: "en",
  },
  {
    code: "zh",
    name: "繁體中文（香港）",
    tag: "zh-Hant-HK",
    dir: "ltr",
    family: "zh",
  },
  {
    code: "zh-TW",
    name: "繁體中文（台灣）",
    tag: "zh-Hant-TW",
    dir: "ltr",
    family: "zh",
    baseLocale: "zh",
  },
  {
    code: "zh-Hans",
    name: "简体中文",
    tag: "zh-Hans",
    dir: "ltr",
    family: "zh",
  },
  {
    code: "ja",
    name: "日本語",
    tag: "ja",
    dir: "ltr",
    family: "ja",
  },
  {
    code: "ko",
    name: "한국어",
    tag: "ko",
    dir: "ltr",
    family: "ko",
  },
  {
    code: "de",
    name: "Deutsch",
    tag: "de",
    dir: "ltr",
    family: "de",
  },
  {
    code: "fr",
    name: "Français",
    tag: "fr",
    dir: "ltr",
    family: "fr",
  },
  {
    code: "es-ES",
    name: "Español (España)",
    tag: "es-ES",
    dir: "ltr",
    family: "es",
    baseLocale: "es",
  },
  {
    code: "es-MX",
    name: "Español (México)",
    tag: "es-MX",
    dir: "ltr",
    family: "es",
    baseLocale: "es",
  },
  {
    code: "es",
    legacy: true,
    name: "Español (original)",
    tag: "es",
    dir: "ltr",
    family: "es",
  },
  {
    code: "pt-BR",
    name: "Português (Brasil)",
    tag: "pt-BR",
    dir: "ltr",
    family: "pt",
    baseLocale: "pt",
  },
  {
    code: "pt-PT",
    name: "Português (Portugal)",
    tag: "pt-PT",
    dir: "ltr",
    family: "pt",
    baseLocale: "pt",
  },
  {
    code: "pt",
    legacy: true,
    name: "Português (original)",
    tag: "pt-BR",
    dir: "ltr",
    family: "pt",
  },
  {
    code: "it",
    name: "Italiano",
    tag: "it",
    dir: "ltr",
    family: "it",
  },
  {
    code: "ar",
    name: "العربية",
    tag: "ar",
    dir: "rtl",
    family: "ar",
  },
];
export const selectableLocales = locales.filter((l) => !l.legacy);
export const localeCodes = locales.map((l) => l.code);
export const validLocale = (code) => localeCodes.includes(code);
export const localeInfo = (code) =>
  locales.find((l) => l.code === code) || locales[0];
export function detectLocale(preferred = []) {
  for (const raw of preferred) {
    const value = String(raw).replaceAll("_", "-").toLowerCase();
    if (value === "en") return "en-US";
    if (/^en-(hk|au|nz|ie|sg|za)(-|$)/.test(value)) return "en-GB";
    if (value.startsWith("en-") && !["en-us","en-gb"].includes(value)) return "en-US";
    const exact = locales.find((l) => l.code.toLowerCase() === value);
    if (exact) return exact.code;
    if (/^zh(?:-[a-z]+)*-tw$/.test(value)) return "zh-TW";
    if (value.startsWith("zh"))
      return /hant|hk|tw|mo/.test(value) ? "zh" : "zh-Hans";
    const code = value.split("-")[0];
    if (validLocale(code)) return code;
  }
  return "en-US";
}
export function cardLanguages(value) {
  // Existing snapshots remain readable, with exactly the same language order.
  if (value === "both") return ["en", "zh"];
  if (typeof value !== "string") return [];
  const codes = value.split("+");
  return codes.length >= 1 &&
    codes.length <= 2 &&
    codes.every(validLocale) &&
    new Set(codes).size === codes.length
    ? codes
    : [];
}
export const validCardLanguages = (value) => cardLanguages(value).length > 0;
export function encodeCardLanguages(codes) {
  const value = Array.isArray(codes) ? codes.join("+") : "";
  if (!validCardLanguages(value)) throw new Error("Invalid card languages");
  return value === "en+zh" ? "both" : value;
}
