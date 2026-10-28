// What Colophon's support includes and what it doesn't (code plan 8.2), shown on the help page and next to the plans
// on the sign-up page. Plain ES module with no imports, so both pages read the same words. Customer-facing: plain
// words, never a rival's name.

export const SUPPORT = Object.freeze({
  title: "What our help includes",
  includes: Object.freeze([
    "Answers in writing, from a person, when you ask from your account page.",
    "Fixing anything in Colophon that doesn't work as it should.",
    "Help bringing your shop over: we check your file with you if an import goes wrong.",
    "Plain answers to questions about your plan and your bill.",
  ]),
  excludes: Object.freeze([
    "Setup calls. Every step has a written answer here, and we answer your questions in writing.",
    "Data entry. We don't add or change your books, prices, stock or orders for you.",
    "Design work. We don't make logos, photos or custom looks; choose a theme and make it yours in Design.",
  ]),
});

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The block as HTML, for the help page (and the same words are written into the sign-up page). */
export function renderSupport() {
  return `<section class="support" aria-labelledby="support-title">
<h2 id="support-title">${esc(SUPPORT.title)}</h2>
<ul>${SUPPORT.includes.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
<p><b>Not included:</b></p>
<ul>${SUPPORT.excludes.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
</section>`;
}
