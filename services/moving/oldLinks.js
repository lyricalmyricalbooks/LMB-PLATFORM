// The old-link check (code plan 23.8). Before a press points its web address at the new shop, this reads the old
// shop's public site map, the list of every page address it gives search engines, so the shop's admin can try each one
// on the new shop and redirect any that would land on "page not found". Nothing here is saved.
//
// Where the map is: the "Sitemap:" lines of robots.txt first, else the usual addresses (/sitemap.xml,
// /sitemap_index.xml, /wp-sitemap.xml). A map that lists other maps is followed (same site only, at most MAX_MAPS
// reads in all). Every read goes through the same careful fetch as the product reader (safeFetch.js). Press-facing
// words never name another shop system.
import { getPublicText } from "./safeFetch.js";
import { NOT_AN_ADDRESS, shopOrigin } from "./oldShop.js";

export const MAX_LINKS = 5000;
export const MAX_MAPS = 25;
const DEFAULT_MAPS = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];

export const NO_MAP = "We couldn't find a list of your old shop's pages at that address. Check the address, or add redirects by hand below.";
export const UNREACHABLE = "We couldn't reach that address. Check it and try again.";

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

/** Every <loc> in a site map, in order. */
export function locs(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)) out.push(decode(m[1]));
  return out;
}

/** True for a map that lists other maps rather than pages. */
export const isIndex = (xml) => /<sitemapindex[\s>]/i.test(String(xml || ""));

/** The site maps robots.txt names. */
export function robotsMaps(text) {
  return [...String(text || "").matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
}

const bare = (host) => host.toLowerCase().replace(/^www\./, "");

/** The address on the same site as `host` (with or without www), as an https URL, else null. */
export function onSite(url, host) {
  try {
    const u = new URL(url, `https://${host}`);
    if (!/^https?:$/.test(u.protocol) || bare(u.hostname) !== bare(host)) return null;
    return `https://${u.hostname}${u.pathname}${u.search}`;
  } catch { return null; }
}

/** A page address's path as the new shop compares it: decoded where it can be, no trailing slash, no query. */
export function pathOf(url) {
  let p;
  try { p = new URL(url).pathname; } catch { return ""; }
  try { p = decodeURI(p); } catch { /* keep it as written */ }
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : "/";
}

/**
 * Reads the old shop's page addresses. Answers { ok: true, host, paths, notes } or { ok: false, message } in plain words.
 * `getText(url)` is getPublicText, injectable for tests.
 */
export async function readOldLinks(input, { getText = (url) => getPublicText(url) } = {}) {
  const origin = shopOrigin(input);
  if (!origin) return { ok: false, message: NOT_AN_ADDRESS };
  const host = new URL(origin).hostname;
  const notes = [];
  let reads = 0;
  const read = async (url) => { reads += 1; return getText(url); };
  let robots;
  try { robots = await read(`${origin}/robots.txt`); } catch { return { ok: false, message: UNREACHABLE }; }
  const named = robotsMaps(robots).map((u) => onSite(u, host)).filter(Boolean);
  const queue = [...new Set([...named, ...DEFAULT_MAPS.map((p) => `${origin}${p}`)])];
  const seen = new Set();
  const paths = new Set();
  let found = false;
  let skippedZip = false;
  while (queue.length && reads < MAX_MAPS && paths.size < MAX_LINKS) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    if (/\.gz(\?|$)/i.test(url)) { skippedZip = true; continue; }
    let xml = null;
    try { xml = await read(url); } catch { xml = null; }
    if (!xml || !/<(urlset|sitemapindex)[\s>]/i.test(xml)) continue;
    if (!found) {
      // The first map that answers is the shop's: drop the other usual addresses still waiting.
      found = true;
      for (let i = queue.length - 1; i >= 0; i -= 1) if (DEFAULT_MAPS.some((p) => queue[i] === `${origin}${p}`)) queue.splice(i, 1);
    }
    const listed = locs(xml).map((u) => onSite(u, host)).filter(Boolean);
    if (isIndex(xml)) { for (const u of listed) if (!seen.has(u)) queue.push(u); continue; }
    for (const u of listed) { if (paths.size >= MAX_LINKS) break; paths.add(pathOf(u)); }
  }
  if (!paths.size) return { ok: false, message: NO_MAP };
  if (queue.length || paths.size >= MAX_LINKS) notes.push(`Your old shop has more pages than one check reads, so the first ${paths.size.toLocaleString("en")} were checked.`);
  if (skippedZip) notes.push("Part of your old shop's page list is packed in a form we can't read, so some pages may be missing below.");
  return { ok: true, host, paths: [...paths], notes };
}
