// Fixed-window rate limits for the public endpoints (order lookup, discount
// codes, checkout). Counters live in the server-only `rate-limits` collection;
// firestore.rules deny every browser read/write there.
const crypto = require("crypto");

// Google's front end (Cloud Functions v2 / Cloud Run) APPENDS the address it saw to
// X-Forwarded-For, so anything to the left of it was typed by the client and can be
// rotated to dodge the limits. Walk from the right and skip Google load-balancer and
// private addresses: the first remaining entry is the real connecting client.
const PROXY_PREFIXES = ["35.191.", "130.211.0.", "130.211.1.", "130.211.2.", "130.211.3.", "10.", "192.168.", "169.254.", "127.", "::1", "fc", "fd"];
const isProxyAddress = ip => PROXY_PREFIXES.some(p => ip.toLowerCase().startsWith(p)) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
function clientIpOf(req) {
  const hops = String(req?.headers?.["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isProxyAddress(hops[i])) return hops[i];
  }
  return hops[0] || req?.ip || req?.socket?.remoteAddress || "unknown";
}

// The visitor's country as the hosting platform saw it (App Engine / Google front end sets and overwrites
// X-AppEngine-Country; a client cannot choose it). Empty when the platform gave none: the "location
// mismatch" signal then stays off rather than guessing from a third-party lookup of the shopper's address.
function serverGeoCountry(req) {
  const raw = String(req?.headers?.["x-appengine-country"] || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) && raw !== "ZZ" ? raw : "";
}

// The key a connection is limited by. An IPv4 address is its own key. An IPv6 customer owns a whole
// /64 (2^64 addresses), so every address in the same /64 shares one key; otherwise a script could
// take a fresh "connection" for each request and never meet a per-connection cap.
function ipKey(ip) {
  const raw = String(ip || "").trim().toLowerCase().split("%")[0];
  if (!raw.includes(":")) return raw;
  const mapped = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(raw);
  if (mapped) return mapped[1];
  const halves = raw.split("::");
  if (halves.length > 2) return raw;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  if (groups.length !== 8 || !groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return raw;
  return `${groups.slice(0, 4).map(g => g.padStart(4, "0")).join(":")}::/64`;
}

// Pure: given the saved counter, decide whether this hit is allowed and what to store.
function nextWindow(saved, nowMs, { max, windowMs }) {
  const start = Number(saved?.windowStart) || 0;
  if (!start || nowMs - start >= windowMs) {
    return { allowed: true, record: { windowStart: nowMs, count: 1 } };
  }
  const count = (Number(saved?.count) || 0) + 1;
  return { allowed: count <= max, record: { windowStart: start, count } };
}

// Returns true when allowed. Fails open if Firestore is unavailable: a broken
// counter must never stop a real customer from paying.
async function hitLimit(db, bucket, req, opts) {
  const id = `${bucket}_${crypto.createHash("sha256").update(ipKey(clientIpOf(req))).digest("hex").slice(0, 32)}`;
  const ref = db.collection("rate-limits").doc(id);
  try {
    return await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const { allowed, record } = nextWindow(snap.exists ? snap.data() : null, Date.now(), opts);
      tx.set(ref, { ...record, bucket, expiresAt: new Date(record.windowStart + opts.windowMs * 2) });
      return allowed;
    });
  } catch (err) {
    console.warn(`Rate limit check failed (${bucket}):`, err.message);
    return true;
  }
}

const LIMITS = {
  track: { max: 60, windowMs: 10 * 60 * 1000 },
  // Payment status polls (each may read Stripe): the tracking and thank-you pages re-check every few seconds.
  status: { max: 120, windowMs: 10 * 60 * 1000 },
  discount: { max: 30, windowMs: 10 * 60 * 1000 },
  autoDiscount: { max: 120, windowMs: 10 * 60 * 1000 },
  checkout: { max: 30, windowMs: 10 * 60 * 1000 },
  // Endpoints that cost money per call (Shippo rates / address checks, PayPal API).
  shippo: { max: 60, windowMs: 10 * 60 * 1000 },
  paypal: { max: 20, windowMs: 10 * 60 * 1000 },
  // Checkout address finder (Google Places, billed per lookup): per connection, and for the whole shop per day.
  address: { max: 120, windowMs: 10 * 60 * 1000 },
  // 300 a day (~9,000 a month) stays inside Google's 10,000 free requests per month.
  addressShopDay: { max: 300, windowMs: 24 * 60 * 60 * 1000 },
  // Admin AI writing assistant: room for Describe with AI on a few books' photos in a row (admin only; Google's
  // and OpenRouter's own limits still apply, and a used-up Google key hands over to OpenRouter).
  aiWrite: { max: 120, windowMs: 10 * 60 * 1000 },
  // Shopper-side crash reports (functions/clientErrors.js): enough for a page that fails a few times in a row.
  clientError: { max: 20, windowMs: 10 * 60 * 1000 },
  // Admin Overview reads of Google Analytics (each is 3 Data API calls; GA4 allows thousands a day).
  ga4: { max: 60, windowMs: 10 * 60 * 1000 },
};

module.exports = { clientIpOf, ipKey, serverGeoCountry, nextWindow, hitLimit, LIMITS };
