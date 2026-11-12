// Draws the terms page from terms.js (English) or termsFr.js (French, for Quebec). Pure string building, so the tests
// check the same markup the page shows.
import { SECTIONS, TERMS_VERSION } from "./terms.js";
import { PAGE_FR, SECTIONS_FR } from "./termsFr.js";

// Every attribute here is double-quoted, so an apostrophe can stay as it is (French is full of them).
const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const PAGE_EN = Object.freeze({
  version: "When these words change, the version changes, and we ask you to agree again.",
  contents: "On this page",
  other: "Lire en français",
});

/** "fr" when the address asks for French (?lang=fr), else "en". */
export const pageLanguage = (search = "") => (/(?:^|[?&])lang=fr\b/i.test(search) ? "fr" : "en");

/** The page's main block: a contents list, each section, and the version. */
export function renderTerms(lang = "en") {
  const fr = lang === "fr";
  const words = fr ? PAGE_FR : PAGE_EN;
  const sections = fr ? SECTIONS_FR : SECTIONS;
  const other = `<p><a href="${fr ? "./" : "./?lang=fr"}" hreflang="${fr ? "en" : "fr"}" lang="${fr ? "en" : "fr"}">${esc(words.other)}</a></p>`;
  const contents = `<nav class="cp-toc" aria-label="${esc(words.contents)}">${sections.map((s) => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join("")}</nav>`;
  const body = sections.map((s) => `<section id="${esc(s.id)}" aria-labelledby="h-${esc(s.id)}">
<h2 id="h-${esc(s.id)}">${esc(s.title)}</h2>
${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n")}
</section>`).join("\n");
  return `${other}\n<div class="cp-split cp-split-toc"><div>${contents}</div>\n<div class="cp-prose">${body}\n<p class="checked">Version <code>${esc(TERMS_VERSION)}</code>. ${esc(words.version)}</p></div></div>`;
}
