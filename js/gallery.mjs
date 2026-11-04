import { localizedCopy } from "./localization.mjs";
import { localeInfo } from "./languages.mjs";
import { uiIcon } from "./ui-icons.mjs";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// Rebuild geometry rather than inserting supplied markup. Even a malformed backup
// cannot introduce script, links, CSS, foreign content or external asset requests.
function safeThumbnail(markup, label) {
  if (
    typeof markup !== "string" ||
    markup.length > 400000 ||
    typeof DOMParser === "undefined"
  )
    return "";
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror"))
    return "";
  const viewBox = root.getAttribute("viewBox") || "0 0 800 800";
  if (!/^0 0 (?:800 (?:800|600)|200 (?:200|150))$/.test(viewBox.trim()))
    return "";
  const numeric = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
  const colour = /^(?:#[\da-fA-F]{3,8}|white|none)$/;
  const attrs = {
    rect: ["x", "y", "width", "height", "fill"],
    circle: ["cx", "cy", "r", "fill"],
    path: [
      "d",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
    ],
  };
  const children = [];
  for (const child of root.children) {
    const allowed = attrs[child.localName];
    if (!allowed || child.children.length) return "";
    const out = [];
    for (const name of allowed) {
      const value = child.getAttribute(name);
      if (value === null) continue;
      const okay =
        name === "d"
          ? /^[MmLlHhVvCcSsQqTtAaZz\d.,\s+\-eE]+$/.test(value)
          : ["fill", "stroke"].includes(name)
            ? colour.test(value)
            : ["stroke-linecap", "stroke-linejoin"].includes(name)
              ? value === "round"
              : numeric.test(value);
      if (!okay) return "";
      out.push(`${name}="${escape(value)}"`);
    }
    children.push(`<${child.localName} ${out.join(" ")}/>`);
  }
  return `<svg class="gallery-thumbnail" viewBox="${viewBox.trim()}" role="img" aria-label="${escape(label)}" focusable="false">${children.join("")}</svg>`;
}

function dateLabel(value, language) {
  if (typeof value !== "number" || value <= 0) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeInfo(language).tag, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function galleryView({
  language = "en",
  items = [],
  loading = false,
  error = false,
  hasMore = false,
  favourites = false,
  icon = uiIcon,
} = {}) {
  const c = localizedCopy(language, "gallery");
  const control = (action, label, glyph, extra = "") =>
    `<button class="gallery-control" data-action="${action}" ${extra}>${glyph ? icon(glyph) : ""}<span>${escape(label)}</span></button>`;
  const cards = items
    .map((item) => {
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : c.untitled;
      const date = dateLabel(item.createdAt, language);
      const round =
        Number.isInteger(item.round) && item.round > 0
          ? language === "zh" || language === "zh-Hans"
            ? `第 ${item.round} ${language === "zh" ? "輪" : "轮"}`
            : `${c.round} ${item.round}`
          : "";
      const detail = [date, round].filter(Boolean).join(" · ");
      const thumbnail =
        safeThumbnail(item.thumbnail, c.drawing) ||
        `<span class="gallery-thumbnail-placeholder" aria-hidden="true">${icon("pencil")}</span>`;
      return `<li class="gallery-card"><button class="gallery-open" data-action="gallery-open" data-id="${escape(item.id)}" aria-label="${escape(c.open + ": " + title)}"><span class="gallery-paper">${thumbnail}</span><span class="gallery-card-title">${escape(title)}</span>${detail ? `<span class="gallery-card-detail">${escape(detail)}</span>` : ""}${item.previewOnly ? `<span class="gallery-preview-note">${escape(c.preview)}</span>` : ""}</button><button class="gallery-favourite ${item.favourite ? "is-favourite" : ""}" data-action="gallery-favourite" data-id="${escape(item.id)}" aria-pressed="${!!item.favourite}" aria-label="${escape((item.favourite ? c.unfavourite : c.favourite) + ": " + title)}">${icon("heart")}</button></li>`;
    })
    .join("");
  const empty =
    !items.length && !loading && !error
      ? `<div class="gallery-state gallery-empty">${icon(favourites ? "heart" : "pencil")}<h2>${escape(favourites ? c.noFavourites : c.empty)}</h2><p>${escape(favourites ? c.noFavouritesHint : c.emptyHint)}</p></div>`
      : "";
  return `<header class="gallery-header">${control("gallery-back", c.back, "back")}<h1 class="gallery-title">${escape(c.title)}</h1></header><section class="gallery-page" aria-label="${escape(c.title)}"><p class="gallery-intro">${escape(c.intro)}</p><div class="gallery-filters" role="group" aria-label="${escape(c.title)}">${control("gallery-filter", c.all, "pencil", `data-filter="all" aria-pressed="${!favourites}"`)}${control("gallery-filter", c.favourites, "heart", `data-filter="favourites" aria-pressed="${!!favourites}"`)}</div>${error ? `<div class="gallery-state gallery-error" role="status"><p>${escape(c.error)}</p>${control("gallery-retry", c.retry, "redo")}</div>` : ""}${cards ? `<ul class="gallery-grid" aria-busy="${!!loading}">${cards}</ul>` : ""}${empty}${loading ? `<p class="gallery-loading" role="status">${escape(c.loading)}</p>` : ""}${hasMore ? `<div class="gallery-more">${control("gallery-more", c.more, null, loading ? "disabled" : "")}</div>` : ""}</section>`;
}
