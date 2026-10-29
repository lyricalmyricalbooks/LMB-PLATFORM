// Draws the terms page from terms.js. Pure string building, so the tests check the same markup the page shows.
import { DRAFT, SECTIONS, TERMS_VERSION } from "./terms.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The page's main block: the draft notice while there is one, a contents list, each section, and the version. */
export function renderTerms() {
  const notice = DRAFT
    ? `<div class="cp-alertline" data-tone="warning" role="note"><p><b>DRAFT.</b> A lawyer hasn't read these words yet. They show what we mean to promise, and may change before the first paid plan.</p></div>`
    : "";
  const contents = `<nav class="cp-toc" aria-label="On this page">${SECTIONS.map((s) => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join("")}</nav>`;
  const sections = SECTIONS.map((s) => `<section id="${esc(s.id)}" aria-labelledby="h-${esc(s.id)}">
<h2 id="h-${esc(s.id)}">${esc(s.title)}</h2>
${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n")}
</section>`).join("\n");
  return `${notice}\n<div class="cp-split cp-split-toc"><div>${contents}</div>\n<div class="cp-prose">${sections}\n<p class="checked">Version <code>${esc(TERMS_VERSION)}</code>. When these words change, the version changes, and we ask you to agree again.</p></div></div>`;
}
