// GENERATED from services/moving/safeFetch.js by services/moving/sync.mjs. Edit the source, never this copy.
// One careful GET of another site's public JSON, for bringing a shop over from its address (code plan 23.2). The same
// rules as the shop's photo copier (apps/shop/functions/photoImport.js): https on a public host name only (never an IP,
// localhost or an internal name), every address the name looks up must be public, the request connects to the very
// address that was checked (the name is never looked up again), redirects are followed by hand (at most three, each
// checked first), the time limit covers the whole read, and reading stops past the size cap.
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** True for an https address on a public host name. */
export function publicHttps(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return false;
  if (host === "localhost" || /\.(localhost|internal|local|lan|home|corp)$/.test(host)) return false;
  return true;
}

/** True for an address no outside fetch may reach: private, loopback, link-local, shared, multicast or unspecified. */
export function privateAddress(address) {
  const a = String(address || "").toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateAddress(mapped[1]);
  const v4 = a.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [b0, b1] = [Number(v4[1]), Number(v4[2])];
    return b0 === 0 || b0 === 10 || b0 === 127 || b0 >= 224
      || (b0 === 169 && b1 === 254) || (b0 === 172 && b1 >= 16 && b1 <= 31) || (b0 === 192 && b1 === 168)
      || (b0 === 100 && b1 >= 64 && b1 <= 127);
  }
  if (!a.includes(":")) return true;
  return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a);
}

const defaultLookup = (host) => dnsLookup(host, { all: true, verbatim: true });

async function checkAddress(url, lookup) {
  if (!publicHttps(url)) throw new Error("not a public https address");
  const found = await lookup(new URL(url).hostname);
  const list = Array.isArray(found) ? found : [found];
  if (!list.length || list.some((r) => privateAddress(r?.address))) throw new Error("the address points inside a private network");
  const { address, family } = list[0];
  return { address, family: family === 6 || String(address).includes(":") ? 6 : 4 };
}

/** One GET that connects only to the checked address. Answers { status, location, type, body (Buffer) }. */
function pinnedGet(url, { address, signal, accept = "application/json", request = httpsRequest }) {
  const u = new URL(url);
  const lookup = (_host, opts, cb) => {
    const done = typeof opts === "function" ? opts : cb;
    if (opts && typeof opts === "object" && opts.all) done(null, [{ address: address.address, family: address.family }]);
    else done(null, address.address, address.family);
  };
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: "https:", hostname: u.hostname, port: 443, path: `${u.pathname}${u.search}`, method: "GET",
      servername: u.hostname, headers: { host: u.host, accept, "user-agent": "Colophon shop mover" },
      lookup, agent: false, signal,
    }, async (res) => {
      const status = res.statusCode || 0;
      const header = (name) => { const v = res.headers?.[name]; return Array.isArray(v) ? v.join(", ") : v ? String(v) : ""; };
      if ([301, 302, 303, 307, 308].includes(status) || status < 200 || status >= 300) {
        res.destroy();
        resolve({ status, location: header("location"), type: "", body: Buffer.alloc(0) });
        return;
      }
      const parts = [];
      let total = 0;
      try {
        for await (const chunk of res) {
          total += chunk.length;
          if (total > MAX_BYTES) { res.destroy(); reject(new Error("too large")); return; }
          parts.push(chunk);
        }
      } catch (err) { reject(err); return; }
      resolve({ status, location: "", type: header("content-type").split(";")[0].trim().toLowerCase(), body: Buffer.concat(parts) });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * One careful read of `url`: the final answer { status, type, body } after following up to three checked moves. Throws
 * only when the site can't be reached safely or in time.
 */
async function getPublic(url, { get = pinnedGet, lookup = defaultLookup, timeoutMs = TIMEOUT_MS, accept } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; ; hop += 1) {
      const address = await checkAddress(current, lookup);
      const res = await get(current, { address, signal: controller.signal, ...(accept ? { accept } : {}) });
      if (![301, 302, 303, 307, 308].includes(res.status)) return res;
      if (!res.location || hop >= MAX_REDIRECTS) throw new Error("too many moves");
      current = new URL(res.location, current).href;
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error("the old shop took too long to answer");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads public JSON at `url`. Null when the site answers without JSON there (missing page, a web page, refused); throws
 * only when the site can't be reached safely or in time. `get` and `lookup` are injectable for tests.
 */
export async function getPublicJson(url, options = {}) {
  const res = await getPublic(url, options);
  if (res.status < 200 || res.status >= 300 || !/json/.test(res.type)) return null;
  try { return JSON.parse(res.body.toString("utf8")); } catch { return null; }
}

/**
 * Reads a public site map or robots file at `url` as text (plan 23.8). Null when the site answers without XML or plain
 * text there; throws like getPublicJson.
 */
export async function getPublicText(url, options = {}) {
  const res = await getPublic(url, { accept: "application/xml, text/xml, text/plain;q=0.9", ...options });
  if (res.status < 200 || res.status >= 300 || !/xml|text\/plain/.test(res.type)) return null;
  return res.body.toString("utf8");
}
