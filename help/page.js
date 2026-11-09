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
 * (the address's #id), and `sells` words them for what the shop sells. An empty search result says so and points to a
 * person.
 */
export function renderHelp({ search = "", plan = "both", openId = "", sells = null } = {}) {
  const found = searchArticles(search, articlesFor(plan, sells));
  if (!found.length) {
    return `<p class="empty" role="status">No answer has all of those words. Try fewer words, or ask us: use <b>Get help from Colophon</b> on your account page.</p>`;
  }
  // A search says how many answers it found, so a short list doesn't look like a broken page.
  const count = search.trim() ? `<p class="cp-found" role="status">${found.length} ${found.length === 1 ? "answer" : "answers"} for “${esc(search.trim())}”</p>` : "";
  return count + TOPICS.map((topic) => {
    const list = found.filter((a) => a.topic === topic);
    if (!list.length) return "";
    return `<section class="topic" aria-labelledby="t-${esc(topic.toLowerCase().replace(/[^a-z]+/g, "-"))}">
<h2 id="t-${esc(topic.toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(topic)}</h2>
${list.map((a) => article(a, a.id === openId || (search && found.length <= 3))).join("\n")}
</section>`;
  }).join("\n");
}

const slug = (topic) => topic.toLowerCase().replace(/[^a-z]+/g, "-");

/** The six topics as sheets over the answers: how many answers each has and its first three questions. */
export function renderTopics({ plan = "both", sells = null } = {}) {
  const all = articlesFor(plan, sells);
  return TOPICS.map((topic) => {
    const list = all.filter((a) => a.topic === topic);
    if (!list.length) return "";
    // The topic's name leads to all its answers; each question opens its own answer.
    return `<div class="card cp-topic"><a class="cp-topic-name" href="#t-${esc(slug(topic))}"><b>${esc(topic)}</b><span>${list.length} ${list.length === 1 ? "answer" : "answers"}</span></a>
<ul>${list.slice(0, 3).map((a) => `<li><a href="#${esc(a.id)}">${esc(a.question)}</a></li>`).join("")}</ul></div>`;
  }).join("\n");
}
