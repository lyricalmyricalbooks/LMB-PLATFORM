// GENERATED from services/moving/oldPages.js by services/moving/sync.mjs. Edit the source, never this copy.
// Bring the old shop's own pages over (code plan 23.6): About, Shipping, FAQ and the like, found by the old-link check
// (oldLinks.js) and read here so the shop's admin can save each one as a draft page with a redirect from its old address.
//
// A page from another site is never trusted. Its text is rebuilt from scratch with an allow-list: paragraphs,
// headings, lists, quotes, bold, italics, line breaks and links. Every tag is written here, never copied, so no
// attribute, script, style or frame can come through; text is escaped; a link keeps only an address on the old shop
// (as a path, which its redirects then send on) or a plain https address elsewhere. Photos are counted, not copied.
// Every read goes through the careful fetch (safeFetch.js). Press-facing words never name another shop system.
import { getPublicPage } from "./safeFetch.mjs";
import { NOT_AN_ADDRESS, shopOrigin } from "./oldShop.mjs";
import { onSite } from "./oldLinks.mjs";

export const MAX_PAGES = 20;
export const MAX_BODY = 100_000;
const AT_ONCE = 4;

/** Addresses that are never one of the shop's own pages: the shop, its listings, its account and its posts. */
const NOT_A_PAGE = /^\/(cart|checkout|account|login|register|search|shop|store|products?|collections?|categor(y|ies)|product-category|product-tag|tags?|blogs?|news|journal|feed|policies|wp-[a-z-]+|sitemap[^/]*|robots\.txt|cdn|apps|tools|admin|password)(\/|$)/i;

/** True for an old address that looks like one of the shop's own pages: /pages/about, or a one-word address like /faq. */
export function isPagePath(path) {
  const p = String(path || "");
  if (/^\/pages\/[^/]+$/i.test(p)) return true;
  // A one-word address that is a language code (/de, /en_GB) is the whole shop in another language, not a page.
  return /^\/[^/]+$/.test(p) && !NOT_A_PAGE.test(p) && !/^\/[a-z]{2}([_-][a-z]{2})?$/i.test(p) && !/\.(?!html?$)[a-z0-9]{2,4}$/i.test(p);
}

/** The new page's address word from the old one: "/pages/About-Us.html" → "about-us". */
export function slugFor(path) {
  const last = String(path || "").split("/").filter(Boolean).pop() || "";
  let word = last.replace(/\.html?$/i, "");
  try { word = decodeURIComponent(word); } catch { /* keep it */ }
  return word.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

const DROP = ["script", "style", "noscript", "template", "svg", "iframe", "object", "embed", "form", "nav", "header", "footer", "aside", "button", "select", "textarea", "head", "canvas", "video", "audio"];
/** Allowed tags, as they are written out. */
const KEEP = { p: "p", h2: "h2", h3: "h3", h4: "h4", h5: "h4", h6: "h4", ul: "ul", ol: "ol", li: "li", blockquote: "blockquote", strong: "strong", b: "strong", em: "em", i: "em", a: "a" };
const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "div", "section", "article", "main", "table", "tr", "td", "th", "dl", "dt", "dd", "figure", "figcaption", "hr"]);
const TEXT_HOLDERS = new Set(["p", "h2", "h3", "h4", "li", "blockquote"]);

const escapeText = (s) => s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plain = (html) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();

/** The part of the page that holds its own words: <main>, else the first <article>, else <body>. */
function contentOf(html) {
  for (const tag of ["main", "article", "body"]) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
    if (!open) continue;
    const close = html.toLowerCase().lastIndexOf(`</${tag}`);
    return html.slice(open.index + open[0].length, close > open.index ? close : undefined);
  }
  return html;
}

/** The link's address as kept: a path on the old shop, an https address elsewhere, or "" to drop the link. */
function linkTo(attrs, pageUrl, host) {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const raw = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/&amp;/gi, "&").trim();
  if (!raw || raw.startsWith("#")) return "";
  let u;
  try { u = new URL(raw, pageUrl); } catch { return ""; }
  if (onSite(u.href, host)) return `${u.pathname}${u.search}`;
  if (u.protocol === "mailto:") return `mailto:${u.pathname}`;
  return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
}

/**
 * A picture's address as kept (plan 23.13): an https address on a public host name, from src (else the first lazy-load
 * address or srcset entry). The shop's hourly photo import copies it into the shop's own storage (functions/photoImport.js).
 */
function imageFrom(attrs) {
  const attr = (name) => {
    const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/&amp;/gi, "&").trim();
  };
  const candidates = [attr("src"), attr("data-src"), attr("data-original"), attr("srcset").split(",")[0].trim().split(/\s+/)[0] || ""];
  return candidates.find((c) => c && !/^data:/i.test(c) && !c.includes("{")) || "";
}

function publicImage(raw, pageUrl) {
  if (!raw) return "";
  let u;
  try { u = new URL(raw, pageUrl); } catch { return ""; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || !host.includes(".") || /^[\d.]+$/.test(host) || host.startsWith("[")) return "";
  return u.href.length <= 2000 ? u.href : "";
}

const altOf = (attrs) => plain((/(?:^|\s)alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs) || [])[1] ?? "").slice(0, 300);

/**
 * One page of the old shop as { title, body, images }: the title from its first main heading (else the window title,
 * less the shop's name), the body rebuilt with the allow-list. `pageUrl` resolves its links and pictures. Pictures on
 * public https addresses are kept as `<img src alt>` (plan 23.13); `images` counts the ones that couldn't be.
 */
export function pageFromHtml(html, pageUrl) {
  const host = new URL(pageUrl).hostname;
  let src = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  // "About us – Moth Press" or "Moth Press | About us": the part that isn't the shop's name.
  const brand = host.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  const parts = plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(src)?.[1] || "").split(/\s+[|–—-]\s+/).filter(Boolean);
  const windowTitle = parts.find((t) => !t.toLowerCase().replace(/[^a-z0-9]/g, "").includes(brand)) || parts[0] || "";
  src = contentOf(src);
  for (let round = 0; round < 3; round += 1) for (const tag of DROP) src = src.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"), " ").replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), " ");
  let images = 0;
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(src);
  const title = (plain(h1?.[1] || "") || windowTitle).slice(0, 200);
  if (h1) src = src.replace(h1[0], " ");

  const out = [];
  const stack = []; // tags written and still open, as written
  let autoP = false;
  const closeTo = (i) => { while (stack.length > i) out.push(`</${stack.pop()}>`); };
  const closeAutoP = () => { if (autoP) { const i = stack.lastIndexOf("p"); if (i >= 0) closeTo(i); autoP = false; } };
  const inText = () => stack.some((t) => TEXT_HOLDERS.has(t));
  const tokens = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  let m;
  while ((m = tokens.exec(src))) {
    const [, closing, rawTag, attrs, text] = m;
    if (text !== undefined || (!rawTag && m[0] === "<")) {
      const words = (text ?? "<").replace(/\s+/g, " ");
      if (!words.trim() && !inText()) continue;
      if (!inText() && !stack.includes("ul") && !stack.includes("ol")) { out.push("<p>"); stack.push("p"); autoP = true; }
      if (stack.at(-1) === "ul" || stack.at(-1) === "ol") continue; // stray text between list items
      out.push(escapeText(words));
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === "br") { if (inText()) out.push("<br>"); continue; }
    if (tag === "img") {
      const to = publicImage(imageFrom(attrs), pageUrl);
      if (!to) { images += 1; continue; }
      if (!inText() && !stack.includes("ul") && !stack.includes("ol")) { out.push("<p>"); stack.push("p"); autoP = true; }
      if (stack.at(-1) === "ul" || stack.at(-1) === "ol") { images += 1; continue; }
      out.push(`<img src="${escapeAttr(to)}" alt="${escapeAttr(altOf(attrs))}">`);
      continue;
    }
    if (BLOCKS.has(tag)) closeAutoP();
    const keep = KEEP[tag];
    if (!keep) continue;
    if (closing) { const i = stack.lastIndexOf(keep); if (i >= 0) closeTo(i); continue; }
    const openText = () => { if (!inText() && !stack.includes("ul") && !stack.includes("ol")) { out.push("<p>"); stack.push("p"); autoP = true; } };
    if (keep === "a") {
      const to = linkTo(attrs, pageUrl, host);
      if (!to || stack.includes("a")) continue;
      openText();
      out.push(/^https:/.test(to) ? `<a href="${escapeAttr(to)}" rel="noopener">` : `<a href="${escapeAttr(to)}">`);
      stack.push("a");
      continue;
    }
    if (keep === "strong" || keep === "em") openText();
    if (keep === "li" && !stack.includes("ul") && !stack.includes("ol")) { out.push("<ul>"); stack.push("ul"); }
    if (["p", "h2", "h3", "h4", "blockquote"].includes(keep) && stack.some((t) => ["p", "h2", "h3", "h4"].includes(t))) closeTo(stack.findIndex((t) => ["p", "h2", "h3", "h4"].includes(t)));
    out.push(`<${keep}>`);
    stack.push(keep);
  }
  closeTo(0);
  let body = out.join("");
  // Empty blocks and links left by what was dropped.
  for (let round = 0; round < 3; round += 1) body = body.replace(/<(p|h2|h3|h4|li|ul|ol|blockquote|strong|em|a)(?: [^>]*)?>(\s|<br>)*<\/\1>/g, "");
  body = body.replace(/\s*(<br>\s*){3,}/g, "<br><br>").replace(/>\s+</g, "> <").replace(/\s+<\/(p|h2|h3|h4|li|blockquote)>/g, "</$1>").replace(/<(p|h2|h3|h4|li|blockquote)>\s+/g, "<$1>").trim();
  return { title, body, images };
}

/**
 * Reads the old shop's pages at `paths` (from the old-link check). Answers { ok: true, host, pages, skipped } or
 * { ok: false, message }. Each page is { path, slug, title, body, images }. `getPage(url)` is getPublicPage, injectable.
 */
export async function readOldPages(input, paths, { getPage = (url) => getPublicPage(url) } = {}) {
  const origin = shopOrigin(input);
  if (!origin) return { ok: false, message: NOT_AN_ADDRESS };
  const host = new URL(origin).hostname;
  const wanted = [...new Set((Array.isArray(paths) ? paths : []).map((p) => String(p || "")).filter((p) => p.startsWith("/") && isPagePath(p)))].slice(0, MAX_PAGES);
  if (!wanted.length) return { ok: false, message: "None of those addresses look like one of your old shop's own pages." };
  const pages = [];
  const skipped = [];
  const one = async (path) => {
    const url = onSite(`${origin}${encodeURI(path)}`, host);
    let html = null;
    try { html = url ? await getPage(url) : null; } catch { html = null; }
    if (!html) { skipped.push({ path, reason: "couldn't be read" }); return; }
    const page = pageFromHtml(html, url);
    if (!plain(page.body)) { skipped.push({ path, reason: "has no words we could bring over" }); return; }
    if (page.body.length > MAX_BODY) { skipped.push({ path, reason: "is too long to bring over in one go" }); return; }
    pages.push({ path, slug: slugFor(path), ...page, title: page.title || slugFor(path).replace(/-/g, " ") });
  };
  for (let i = 0; i < wanted.length; i += AT_ONCE) await Promise.all(wanted.slice(i, i + AT_ONCE).map(one));
  const order = new Map(wanted.map((p, i) => [p, i]));
  pages.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
  return { ok: true, host, pages, skipped };
}
