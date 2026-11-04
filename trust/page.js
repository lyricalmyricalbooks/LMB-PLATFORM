// Draws the trust page from trust.js. Pure string building, so the tests read the markup the page shows.
import { COMPANIES, CONTACT, DRAFT, PROMISES } from "./trust.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderTrust() {
  const notice = DRAFT
    ? `<div class="cp-alertline" data-tone="warning" role="note"><p><b>DRAFT.</b> This page shows what we mean to promise. A lawyer hasn't read it yet.</p></div>`
    : "";
  // Each promise is its own numbered sheet, two to a row on a wide screen, so the page reads as a list of promises.
  const promises = `<div class="cp-promises">${PROMISES.map((p, i) => `<section class="card" id="${esc(p.id)}" aria-labelledby="h-${esc(p.id)}"><span class="cp-kicker">${String(i + 1).padStart(2, "0")}</span><h2 id="h-${esc(p.id)}">${esc(p.title)}</h2><p>${esc(p.words)}</p></section>`).join("\n")}</div>`;
  const companies = `<section id="companies" aria-labelledby="h-companies"><h2 id="h-companies">Who else handles your data</h2>
<p>These are all of them. If this list changes, we tell you first.</p>
<ul>${COMPANIES.map((c) => `<li><b>${esc(c.name)}</b>: ${esc(c.handles)}</li>`).join("")}</ul></section>`;
  const ask = `<section id="ask" aria-labelledby="h-ask"><h2 id="h-ask">Ask us anything</h2><p>For any question about your data, write to <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>. A person will answer.</p></section>`;
  return `${notice}\n${promises}\n<div class="cp-prose cp-trust-more">${companies}\n${ask}</div>`;
}
