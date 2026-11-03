// Draws the terms page from terms.js (English) or termsFr.js (French, for Quebec). Pure string building, so the tests
// check the same markup the page shows.
import { DRAFT, SECTIONS, TERMS_VERSION } from "./terms.js";
import { PAGE_FR, SECTIONS_FR } from "./termsFr.js";

// Every attribute here is double-quoted, so an apostrophe can stay as it is (French is full of them).
const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const PAGE_EN = Object.freeze({
  draft: "A lawyer hasn't read these words yet. They show what we mean to promise, and may change before the first paid plan.",
  version: "When these words change, the version changes, and we ask you to agree again.",
  contents: "On this page",
  other: "Lire en français",
});

/** "fr" when the address asks for French (?lang=fr), else "en". */
export const pageLanguage = (search = "") => (/(?:^|[?&])lang=fr\b/i.test(search) ? "fr" : "en");

/** The page's main block: the draft notice while there is one, a contents list, each section, and the version. */
export function renderTerms(lang = "en") {
  const fr = lang === "fr";
  const words = fr ? PAGE_FR : PAGE_EN;
  const sections = fr ? SECTIONS_FR : SECTIONS;
  const notice = DRAFT
    ? `<div class="cp-alertline" data-tone="warning" role="note"><p><b>${fr ? "BROUILLON." : "DRAFT."}</b> ${esc(words.draft.replace(/^BROUILLON\.\s*/, ""))}</p></div>`
    : "";
  const other = `<p><a href="${fr ? "./" : "./?lang=fr"}" hreflang="${fr ? "en" : "fr"}" lang="${fr ? "en" : "fr"}">${esc(words.other)}</a></p>`;
  const contents = `<nav class="cp-toc" aria-label="${esc(words.contents)}">${sections.map((s) => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join("")}</nav>`;
  const body = sections.map((s) => `<section id="${esc(s.id)}" aria-labelledby="h-${esc(s.id)}">
<h2 id="h-${esc(s.id)}">${esc(s.title)}</h2>
${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n")}
</section>`).join("\n");
  return `${notice}\n${other}\n<div class="cp-split cp-split-toc"><div>${contents}</div>\n<div class="cp-prose">${body}\n<p class="checked">Version <code>${esc(TERMS_VERSION)}</code>. ${esc(words.version)}</p></div></div>`;
}
