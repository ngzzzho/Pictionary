import { localizedCopy } from "./localization.mjs";

export const tvText = (language, key) => localizedCopy(language, "tv")[key];
const mirroringIcon = `<svg class="tv-mirror-icon" aria-hidden="true" viewBox="0 0 40 32"><rect x="3" y="3" width="25" height="18" rx="3"/><rect x="12" y="11" width="25" height="18" rx="3"/></svg>`;
export function tvView(
  status,
  language,
  { guarded = false, continueRequired = false, startup = false } = {},
) {
  const t = (key) => tvText(language, key),
    button = (key, action, primary = false) =>
      `<button class="btn ${primary ? "primary" : "secondary"}" data-action="${action}">${t(key)}</button>`;
  if (startup)
    return `<section class="tv-loading" role="status"><h1>${t("loadingTitle")}</h1><p>${t("loadingBody")}</p>${status.reason === "reconnecting" ? button("retryStartup", "tv-refresh") : ""}</section>`;
  const reason = status.reason;
  const showGuide =
    !status.connected && (!guarded || (status.enabled && reason === "waiting"));
  const guide = `<section class="tv-guide" aria-label="${t("connectGuide")}"><h2>${t("connectGuide")}</h2><ol>${["stepWifi", "stepControl", "stepMirror", "stepReturn"].map((key, i) => `<li>${i === 2 ? `<span class="tv-mirror-label">${mirroringIcon}<strong>${t("mirrorLabel")}</strong></span>` : ""}<p>${t(key)}</p></li>`).join("")}</ol><p class="hint">${t("connectionTip")}</p></section>`;
  const title = guarded
    ? status.privateAllowed
      ? status.enabled && status.connected
        ? "connected"
        : "ready"
      : reason
    : "subtitle";
  const actions = `${continueRequired && status.privateAllowed ? button(status.enabled && status.connected ? "continueTV" : "continue", "tv-continue", true) : ""}${status.available ? (status.enabled ? button("phoneOnly", "tv-disable") : !guarded ? button("enable", "tv-enable", true) : "") + (guarded || status.enabled ? button("refresh", "tv-refresh") : "") : ""}${!guarded && !status.enabled ? button("phoneOnly", "tv-back") : ""}`;
  return `${guarded ? "" : `<header>${button("back", "tv-back")}<span class="header-title">${t("title")}</span></header>`}<section class="panel tv-panel"><p class="eyebrow">${t(guarded ? (status.enabled ? "title" : "background") : "optional")}</p><h1>${t(title)}</h1><p role="status" class="tv-status">${guarded ? t(status.privateAllowed ? "reconnect" : reason === "waiting" ? "intro" : "protect") : t(status.available ? reason : "browser")}</p>${reason === "route" ? `<p>${t("routeHint")}</p>` : ""}${reason === "captured" ? `<p>${t("capturedHint")}</p>` : ""}${!guarded ? `<p>${t("intro")}</p>` : ""}${showGuide ? guide : ""}${guarded ? "" : `<p>${t("safe")}</p><p class="hint">${t("scores")}</p><p class="hint">${t("paper")}</p>`}</section>${actions ? `<div class="tv-actions" aria-label="${t("title")}">${actions}</div>` : ""}`;
}
