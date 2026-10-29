// Draws the experts page from directory.js. Pure string building, so the tests check the same markup the page shows.
import { KINDS, EXPERTS, APPLY_URL, expertsFor } from "./directory.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** What a press should know before hiring anyone listed here. */
export const EXPERT_NOTE = "These people work for themselves. You agree the work and the price with them directly. Colophon takes no fee and does not handle the payment.";

function card(entry) {
  return `<article class="card expert" id="${esc(entry.id)}">
<h3>${esc(entry.name)}</h3>
<p class="hint">${entry.kinds.map((kind) => esc(KINDS[kind])).join(" · ")} · ${esc(entry.where)}</p>
<p>${esc(entry.about)}</p>
<p><a class="button" href="${esc(entry.link)}" target="_blank" rel="noopener noreferrer">Visit their page</a></p>
</article>`;
}

/** The list for a kind and a search. An empty result says so, and says what to do. */
export function renderExperts({ kind = "", search = "", list = EXPERTS } = {}) {
  const found = expertsFor({ kind, search, list });
  if (!found.length) {
    const none = list.length === 0
      ? "No one is listed yet. We add people we have checked as they join; check back soon."
      : "No one matches that. Try fewer words, or choose all kinds of work.";
    return `<p class="empty" role="status">${esc(none)}</p>`;
  }
  return found.map(card).join("\n");
}

/** The kinds of work as choices for the filter. */
export function renderKindOptions(selected = "") {
  return [`<option value=""${selected ? "" : " selected"}>All kinds of work</option>`,
    ...Object.entries(KINDS).map(([kind, label]) => `<option value="${esc(kind)}"${kind === selected ? " selected" : ""}>${esc(label)}</option>`)].join("");
}

/** How an expert asks to be listed. */
export function renderApply(url = APPLY_URL) {
  return url
    ? `<p>Do this kind of work? <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ask to be listed</a>.</p>`
    : `<p>Do this kind of work for shops like these? Listings open soon.</p>`;
}
