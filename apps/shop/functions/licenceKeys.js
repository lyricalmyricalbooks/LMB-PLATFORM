// Licence keys for digital goods (gap list 38). The owner pastes a product's keys (software, game or course codes) in
// Books › edit › Licence keys; they wait in the admin-only `licenceKeys/{bookId}` record ({ available: [...],
// givenCount, updatedAt }; firestore.rules: admin read and write, never a shopper). When an order is paid, each copy of
// that product takes the next key, once (`licenceKeysAt` on the order), inside one transaction, so two orders never get
// the same key. The order keeps its keys (`licenceKeys: [{ line, title, keys }]`), which the confirmation email and the
// order page show. Pure rules first (tested in licenceKeys.test.js), then the transaction.

const MAX_KEYS = 2000;
const MAX_KEY_LENGTH = 200;

/** The keys pasted in the editor: one per line, trimmed, no blanks or repeats, at most MAX_KEYS of MAX_KEY_LENGTH. */
function cleanKeys(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const key = raw.replace(/[\u0000-\u001f]/g, "").trim();
    if (!key || key.length > MAX_KEY_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

const copies = (line) => Math.max(0, Math.min(99, Math.floor(Number(line && line.quantity) || 0)));

/** The order lines that may carry keys: real product lines (never gift cards, add-on gifts or box sets). */
function keyLines(order) {
  return ((order && order.items) || []).map((line, index) => ({ line, index }))
    .filter(({ line }) => line && line.id && line.giftCard !== true && line.bundle !== true && line.promoGift !== true && copies(line) > 0);
}

/**
 * Hands out keys. `pools` maps a product id to its record (missing = the product has no keys). A line that already has
 * keys (`order.licenceKeys`, an earlier run that ran short) only takes the copies still missing. Returns the order's
 * entries, how many copies still have no key, how many keys were handed out now, and each pool's new `available` list.
 * Pure. `test`: a sandbox rehearsal gets stand-in keys and never spends real ones.
 */
function takeKeys(order, pools, { test = false } = {}) {
  const had = new Map(((order && order.licenceKeys) || []).filter((e) => e && Array.isArray(e.keys)).map((e) => [e.line, e.keys]));
  const left = new Map();
  const assigned = [];
  let short = 0;
  let added = 0;
  for (const { line, index } of keyLines(order)) {
    const pool = pools[line.id];
    const before = had.get(index) || [];
    if (!pool) { if (before.length) assigned.push({ line: index, title: String(line.title || "").slice(0, 200), keys: before }); continue; }
    const want = Math.max(0, copies(line) - before.length);
    let fresh;
    if (test) {
      fresh = Array.from({ length: want }, (_, i) => `TEST-KEY-${index + 1}-${before.length + i + 1}`);
    } else {
      const available = left.has(line.id) ? left.get(line.id) : [...(pool.available || [])];
      fresh = available.splice(0, want);
      left.set(line.id, available);
      short += want - fresh.length;
    }
    added += fresh.length;
    assigned.push({ line: index, title: String(line.title || "").slice(0, 200), keys: [...before, ...fresh] });
  }
  return { assigned, short, added, left };
}

/**
 * Gives a paid order its keys: once when it is paid (`licenceKeysAt`), and again while copies still wait for a key
 * (`licenceKeysShort`), for instance after the owner adds more. Returns { assigned, short, added } or null when
 * there was nothing to do. Safe to run twice. Sandbox orders get stand-in keys.
 */
async function assignLicenceKeys({ db, orderId, now = () => new Date().toISOString() }) {
  const orderRef = db.collection("orders").doc(String(orderId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return null;
    const order = snap.data() || {};
    if (order.paymentStatus !== "paid" || order.status === "cancelled") return null;
    if (order.licenceKeysAt && !(Number(order.licenceKeysShort) > 0)) return null;
    if (order.review && order.review.status === "needs_review") return null;
    const ids = [...new Set(keyLines(order).map(({ line }) => String(line.id)))];
    if (!ids.length) return null;
    const refs = ids.map((id) => db.collection("licenceKeys").doc(id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const pools = {};
    snaps.forEach((s, i) => { if (s.exists) pools[ids[i]] = s.data() || {}; });
    if (!Object.keys(pools).length) return null;
    const test = order.isTest === true || order.sandboxPayment === true;
    const { assigned, short, added, left } = takeKeys(order, pools, { test });
    if (!assigned.length || (order.licenceKeysAt && !added)) return null;
    const at = now();
    for (const [id, available] of left) {
      const given = (pools[id].available || []).length - available.length;
      if (given) tx.update(db.collection("licenceKeys").doc(id), { available, givenCount: (Number(pools[id].givenCount) || 0) + given, updatedAt: at });
    }
    tx.update(orderRef, { licenceKeys: assigned, licenceKeysAt: order.licenceKeysAt || at, licenceKeysShort: short, updatedAt: at });
    return { assigned, short, added };
  });
}

/** The keys block of the confirmation email (escaped), or "". */
function licenceKeysEmailSection(order, { escapeHtml, say = (s) => s }) {
  const entries = ((order && order.licenceKeys) || []).filter((e) => e && Array.isArray(e.keys));
  if (!entries.length) return "";
  const waiting = Number(order.licenceKeysShort) > 0;
  return `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">${say("Your licence codes")}</h3>
            ${entries.map((e) => `<p style="font-size:13px;margin:8px 0 2px;font-weight:bold;">${escapeHtml(e.title)}</p>${e.keys.map((k) => `<p style="font-family:monospace;font-size:14px;margin:2px 0;">${escapeHtml(k)}</p>`).join("")}`).join("")}
            ${waiting ? `<p style="font-size:12px;margin:12px 0 0;line-height:1.6;">${say("We'll send the rest of your codes soon.")}</p>` : ""}
          </div>`;
}

module.exports = { MAX_KEYS, MAX_KEY_LENGTH, cleanKeys, keyLines, takeKeys, assignLicenceKeys, licenceKeysEmailSection };
