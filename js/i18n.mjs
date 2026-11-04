import { catalogs } from "./localization.mjs";
export const messages = Object.fromEntries(
  Object.entries(catalogs).map(([code, data]) => [code, data.ui]),
);
export const translate = (lang, key) =>
  messages[lang]?.[key] ?? messages.en[key] ?? key;
