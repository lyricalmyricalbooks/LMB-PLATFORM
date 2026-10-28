// Draws the help page from articles.js. Pure string building, so the tests check the same markup the page shows.
import { TOPICS, articlesFor, searchArticles } from "./articles.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function article(a, open) {
  const where = a.where?.length
    ? `<p class="where"><span>Where:</span> ${a.where.map((w) => `<b>${esc(w)}</b>`).join(" · ")}</p>`
    : "";
  return `<details class="article" id="${esc(a.id)}"${open ? " open" : ""}>
  <summary><h3>${esc(a.question)}</h3></summary>
  ${a.answer.map((p) => `<p>${esc(p)}</p>`).join("\n  ")}
  ${where}
  <p class="link"><a href="#${esc(a.id)}">Link to this answer</a></p>
</details>`;
}

/**
 * The list for a search and a plan ("both" when the page doesn't know), grouped by topic. `openId` opens one article
 * (the address's #id). An empty search result says so and points to a person.
 */
export function renderHelp({ search = "", plan = "both", openId = "" } = {}) {
  const found = searchArticles(search, articlesFor(plan));
  if (!found.length) {
    return `<p class="empty" role="status">No answer has all of those words. Try fewer words, or ask us: use <b>Get help from Colophon</b> on your account page.</p>`;
  }
  return TOPICS.map((topic) => {
    const list = found.filter((a) => a.topic === topic);
    if (!list.length) return "";
    return `<section class="topic" aria-labelledby="t-${esc(topic.toLowerCase().replace(/[^a-z]+/g, "-"))}">
<h2 id="t-${esc(topic.toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(topic)}</h2>
${list.map((a) => article(a, a.id === openId || (search && found.length <= 3))).join("\n")}
</section>`;
  }).join("\n");
}
