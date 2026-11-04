import { localizedCopy } from "./localization.mjs";
import { localeInfo } from "./languages.mjs";
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export const backupMessage = (language, code) =>
  localizedCopy(language, "backup").errors[code] ||
  localizedCopy(language, "backup").errors.generic;
export function backupView(state, language) {
  const t = localizedCopy(language, "backup"),
    e = escape,
    b = (label, a, klass = "secondary", extra = "") =>
      `<button class="btn ${klass}" data-action="${a}" ${state.busy ? "disabled" : ""} ${extra}><span>${e(label)}</span></button>`;
  const p = state.plan;
  return `<header><button class="btn text" data-action="settings" ${state.busy ? "disabled" : ""}><span>‹ ${t.back}</span></button><span class="header-title">${t.title}</span></header><section class="panel backup-panel"><h1>${t.title}</h1>${!p && !state.done ? `<p>${t.intro}</p><p class="hint">${t.limit}</p>` : ""}${state.busy ? `<p role="status">${t.working} ${t.busy}</p>` : ""}${state.error ? `<p class="error" role="alert">${e(backupMessage(language, state.error))}</p>` : ""}${state.input && state.error === "restoreLocalInvalid" ? b(t.replace, "backup-mode", "secondary", 'data-mode="backup"') : ""}${state.done ? `<div role="status"><h2>${t.done}</h2><p>${t.doneHint}</p></div><div class="backup-actions">${b(t.home, "home", "primary")}${b(t.gallery, "gallery")}</div>` : p ? "" : `<div class="backup-actions">${b(t.export, "backup-create", "primary")}${b(t.import, "backup-pick")}</div><input id="backup-files" type="file" accept=".json,application/json" multiple hidden ${state.busy ? "disabled" : ""}>`}
 ${!p && state.files?.length ? `<section class="backup-files"><h2>${t.export}</h2><p>${t.parts}</p><ol>${state.files.map((f, i) => `<li><strong>${t.part} ${i + 1} ${t.of} ${state.files.length}</strong><small>${e(f.name)}</small>${b(t.save, "backup-save", "secondary", `data-index="${i}"`)}<span role="status">${e(t[state.statuses[i]] || "")}</span></li>`).join("")}</ol></section>` : ""}
 ${
   p
     ? `<section class="restore-preview"><h2>${t.check}</h2><p role="status">${t.checked}</p>${p.summary.partial ? `<p class="error">${t.partial}</p>` : ""}<dl class="backup-summary">${[
         [t.players, p.summary.players],
         [t.words, p.summary.words],
         [t.drawings, p.counts.added],
         [t.duplicate, p.counts.duplicates],
         [t.conflicts, p.counts.conflicts],
         [t.game, p.summary.game ? t.yes : t.no],
         [t.last, p.summary.last ? t.yes : t.no],
         [t.wordsAfter, p.summary.wordsAfter],
       ]
         .map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`)
         .join(
           "",
         )}</dl><div class="restore-choices" role="group" aria-label="${t.check}">${["keep", "backup"].map((mode) => `<button class="option ${state.mode === mode ? "selected" : ""}" data-action="backup-mode" data-mode="${mode}" aria-pressed="${state.mode === mode}" ${state.busy ? "disabled" : ""}><strong>${t[mode === "keep" ? "keep" : "replace"]}</strong><span>${t[mode === "keep" ? "keepHint" : "replaceHint"]}</span></button>`).join("")}</div><div class="backup-actions">${b(t.restore, "backup-restore", "primary")}${b(t.cancel, "backup-cancel")}</div></section>`
     : ""
 }
 ${!p && state.copies?.length ? `<section class="backup-copies"><h2>${t.recovery}</h2><p>${t.recoveryHint}</p>${state.copies.map((c) => `<div><p>${e(new Date(c.createdAt).toLocaleString(localeInfo(language).tag))}</p>${b(t.previous, "backup-previous", "secondary", `data-id="${e(c.id)}"`)}</div>`).join("")}</section>` : ""}</section>`;
}
