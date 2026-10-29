// Website ↔ inventory app link: the pure rules (docs/INVENTORY_LINK.md). No Firestore here.
//
// The inventory app (project lmb-test-stockroom) is the master stock count. The website
// sends it every paid order as copies per inventory book (orderFootprint / websiteOrder), and
// sets each linked edition's stock from the count the app publishes (stockPlanFor).
// Nothing here is a payment path: it never decides whether an order is paid.
const crypto = require("crypto");
const { stockLines, isBundle, isGiftCardProduct } = require("./shared/promotions");
const { isPhysicalItem } = require("./shared/localFulfillment");
const { isBookKind, productKind, usesOptionPicker } = require("./shared/productOptions");
const { shopDate } = require("./paymentGuards");

const WEB_VERSION = 1;
// An order counts once its payment was accepted; a refund keeps it (its copies may not be back).
const COUNTED_STATUSES = new Set(["paid", "refund_pending", "refunded"]);
const DIGITAL_RE = /e-?book|epub|pdf|audiobook|digital/i;
const INVENTORY_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

const whole = value => Math.max(0, Math.floor(Number(value) || 0));
const cents = value => Math.round((Number(value) || 0) * 100);
const dollars = minor => Math.round(Number(minor) || 0) / 100;
const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const lineKey = (bookId, variantId) => `${bookId}|${variantId || ""}`;

/** "#ABCD-123456-WXYZ"; manual-payment orders (24 hex, no hyphen) become "#WEB-<HEX>" so the app can match them. */
function websiteOrderNumber(orderId) {
  const id = text(orderId, 120);
  if (!id) return "";
  return id.includes("-") ? `#${id}` : `#WEB-${id.toUpperCase()}`;
}

function paidInstant(order) {
  const value = order && (order.paidAt || null);
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** The Toronto day the order was paid ("" when unknown). */
function paidDayOf(order) {
  const at = paidInstant(order);
  return at ? shopDate(new Date(at)) : "";
}

/** A real (non-test) order whose payment was accepted on or after the link's start day. */
function countsForInventory(order, startDay) {
  if (!order || order.isTest === true) return false;
  if (!COUNTED_STATUSES.has(order.paymentStatus)) return false;
  const day = paidDayOf(order);
  return !!day && (!startDay || day >= startDay);
}

/**
 * What kind of push an order needs: "real", "test" (a Stripe test-mode rehearsal order, only while
 * rehearsal is on) or null. An order already pushed keeps being pushed so refunds and dispatch follow.
 * `testShop` (shopConfig.testShop, the platform's test shop only): its paid sandbox orders go as real
 * orders from the start day, so the inventory app records them and its count drops, the same path a
 * real sale takes (docs/test-shop.md check 4). A sandbox order already sent as a rehearsal stays one.
 */
function pushKind(order, { startDay = "", rehearsal = false, record = null, testShop = false } = {}) {
  if (!order) return null;
  if (order.isTest === true) {
    if (record && record.test === true) return "test";
    if (testShop === true && order.sandboxPayment === true) {
      if (record) return "real";
      return countsForInventory({ ...order, isTest: false }, startDay) ? "real" : null;
    }
    return rehearsal && order.sandboxPayment === true && COUNTED_STATUSES.has(order.paymentStatus) ? "test" : null;
  }
  if (record && record.test !== true) return "real";
  return countsForInventory(order, startDay) ? "real" : null;
}

/** The inventory book a website book/edition is linked to (null when none). */
function linkFor(links, bookId, variantId) {
  const entry = links && links[bookId];
  if (!entry || typeof entry !== "object") return null;
  const id = entry[variantId || "_"];
  return typeof id === "string" && INVENTORY_ID_RE.test(id) ? id : null;
}

// Largest-remainder split of `totalCents` across `weights`, so the parts always add up.
function splitCents(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (sum <= 0) return splitCents(totalCents, weights.map(() => 1));
  const raw = weights.map(w => (totalCents * w) / sum);
  const out = raw.map(Math.floor);
  let left = totalCents - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1;
  return out;
}

/**
 * Copies per inventory book for one order: sold, put back on the shelf, and the difference.
 *
 * Counts physical copies of linked editions (box sets as the books inside them), never what the
 * website's own stock-keeping happened to do (that depends on trackInventory at the time, which
 * the order doesn't record). `frozen` holds the line→book links an earlier push used: a link chosen
 * later never moves copies already counted for another book.
 * `partPrice(bookId, variantId)` gives a box-set part's catalog price (CAD) to share the set's price;
 * `partDigital(bookId, variantId)` is true for an e-book part, which has no copies to count (never "unlinked").
 */
function orderFootprint(order, links, frozen = {}, partPrice = () => 0, partDigital = () => false) {
  const lineLinks = { ...(frozen || {}) };
  const books = {};
  const unlinked = new Map();
  const touch = inv => (books[inv] = books[inv] || { sold: 0, restocked: 0, merchCents: 0, preorder: false, titles: [] });
  const resolve = (bookId, variantId) => {
    const key = lineKey(bookId, variantId);
    if (!lineLinks[key]) lineLinks[key] = linkFor(links, bookId, variantId);
    return lineLinks[key] || null;
  };

  for (const item of Array.isArray(order?.items) ? order.items : []) {
    if (!item || item.giftCard === true || !isPhysicalItem(item)) continue;
    const sets = whole(item.quantity);
    if (!sets) continue;
    const lineCents = cents(item.price) * sets;
    const isSet = Array.isArray(item.components) && item.components.length > 0;
    const parts = stockLines([item]).filter(part => !(isSet && partDigital(part.id, part.variantId)));
    const shares = isSet
      ? splitCents(lineCents, parts.map(part => Math.max(0, cents(partPrice(part.id, part.variantId))) * whole(part.quantity)))
      : [lineCents];
    parts.forEach((part, index) => {
      const component = isSet ? item.components.find(c => c && c.id === part.id && (c.variantId || null) === (part.variantId || null)) : null;
      const qty = whole(part.quantity);
      if (!qty || typeof part.id !== "string") return;
      const inv = resolve(part.id, part.variantId);
      const title = text(isSet ? (component?.title || item.title) : [item.title, item.variantName].filter(Boolean).join(" — "), 160);
      if (!inv) {
        unlinked.set(title || part.id, (unlinked.get(title || part.id) || 0) + qty);
        return;
      }
      const entry = touch(inv);
      entry.sold += qty;
      entry.merchCents += shares[index] || 0;
      if (item.preorder === true) entry.preorder = true;
      if (title && !entry.titles.includes(title) && entry.titles.length < 5) entry.titles.push(title);
    });
  }

  const restockedLines = [];
  if (order && order.inventoryRestockedAt != null) {
    // A provider/admin refund records exactly what went back; the older manual-refund path restocks every line.
    if (Array.isArray(order.restockedItems)) restockedLines.push(...order.restockedItems);
    else restockedLines.push(...withoutPartials(order.items || [], order.partialRestockedItems));
  }
  for (const row of Array.isArray(order?.partialRestockedItems) ? order.partialRestockedItems : []) {
    const item = (order.items || [])[Number(row?.index)];
    // Partial restocks don't record a box set's parts: take them from the order line.
    restockedLines.push(item && Array.isArray(item.components) && item.components.length
      ? { ...item, quantity: whole(row.quantity) }
      : { id: row?.id, variantId: row?.variantId || null, quantity: whole(row?.quantity) });
  }
  for (const part of stockLines(restockedLines)) {
    if (!part || typeof part.id !== "string") continue;
    const key = lineKey(part.id, part.variantId);
    const inv = lineLinks[key];
    if (!inv || !books[inv]) continue;
    books[inv].restocked += whole(part.quantity);
  }

  const net = {};
  for (const [inv, entry] of Object.entries(books)) {
    entry.restocked = Math.min(entry.restocked, entry.sold);
    net[inv] = entry.sold - entry.restocked;
  }
  return {
    net, books, lineLinks,
    unlinked: [...unlinked].map(([title, qty]) => ({ title, qty })).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

function withoutPartials(items, partials) {
  const left = new Map();
  for (const row of Array.isArray(partials) ? partials : []) {
    const key = lineKey(row?.id, row?.variantId);
    left.set(key, (left.get(key) || 0) + whole(row?.quantity));
  }
  return items.map(item => {
    const key = lineKey(item?.id, item?.variantId);
    const take = Math.min(left.get(key) || 0, whole(item?.quantity));
    if (!take) return item;
    left.set(key, left.get(key) - take);
    return { ...item, quantity: whole(item.quantity) - take };
  }).filter(item => item && whole(item.quantity) > 0);
}

// Sorted-key JSON, so the same content always hashes the same.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function refundOf(order) {
  if (["refunded", "refund_pending"].includes(order.paymentStatus)) {
    const minor = Number.isFinite(Number(order.refundedAmountMinor)) && order.refundedAmountMinor != null
      ? Math.round(Number(order.refundedAmountMinor))
      : cents(order.refund?.amount ?? order.total);
    return { state: "full", refund: { amountMinor: minor, currency: text(order.refund?.currency || order.expectedCurrency || "CAD", 3).toUpperCase() } };
  }
  if (order.partiallyRefunded === true && Number(order.refundedAmountMinor) > 0) {
    return { state: "partial", refund: { amountMinor: Math.round(Number(order.refundedAmountMinor)), currency: text(order.expectedCurrency || order.checkoutCurrency || "CAD", 3).toUpperCase() } };
  }
  return { state: "none", refund: null };
}

/**
 * The `web` map for websiteOrders/{orderId} (contract v1) and the copies it counts.
 * Returns { web, net, lineLinks, unlinkedCount }.
 */
function websiteOrder(order, { orderId, links, frozen, partPrice, partDigital, test = false, sourceUpdatedAt = null } = {}) {
  const fp = orderFootprint(order, links, frozen, partPrice, partDigital);
  const addr = order.customer?.address || {};
  const { state, refund } = refundOf(order);
  const charged = {
    currency: text(order.expectedCurrency || order.checkoutCurrency || "CAD", 3).toUpperCase() || "CAD",
    amountMinor: Number.isFinite(Number(order.expectedAmountMinor)) && order.expectedAmountMinor != null
      ? Math.round(Number(order.expectedAmountMinor)) : cents(order.total),
  };
  const books = {};
  for (const [inv, entry] of Object.entries(fp.books)) {
    books[inv] = {
      net: entry.sold - entry.restocked, sold: entry.sold, restocked: entry.restocked,
      unitCAD: entry.sold ? dollars(Math.round(entry.merchCents / entry.sold)) : 0,
      merchCAD: dollars(entry.merchCents), preorder: entry.preorder, titles: entry.titles,
    };
  }
  const firstBook = Object.keys(books).sort((a, b) => books[b].merchCAD - books[a].merchCAD || a.localeCompare(b))[0] || null;
  const shippedAt = typeof order.shippedAt === "string" && !Number.isNaN(Date.parse(order.shippedAt)) ? order.shippedAt : null;
  const method = ["pickup", "local_delivery"].includes(order.fulfillmentSelection?.method) ? order.fulfillmentSelection.method : "shipping";
  const trackingNumber = text(order.trackingNumber, 100);
  const body = {
    v: WEB_VERSION,
    orderId: text(orderId, 120),
    number: websiteOrderNumber(orderId),
    test: test === true,
    paidAt: paidInstant(order),
    paidDay: paidDayOf(order) || null,
    paymentMethod: text(order.paymentMethod, 60),
    paymentStatus: text(order.paymentStatus, 30),
    refundState: state,
    refund,
    stripePaymentIntentId: text(order.stripePaymentIntentId, 120) || null,
    paypalCaptureId: text(order.paypalCaptureId, 120) || null,
    totals: {
      subtotal: dollars(cents(order.subtotal)), discount: dollars(cents(order.discount)),
      discountCode: text(order.appliedDiscount?.code || order.appliedDiscount?.title || "", 80),
      shipping: dollars(cents(order.shipping)), tax: dollars(cents(order.tax)),
      total: dollars(cents(order.total)), giftCard: dollars(cents(order.giftCardAmount)),
    },
    charged,
    customer: {
      name: text(order.customer?.name, 200), email: text(order.customer?.email, 320).toLowerCase(), phone: text(order.customer?.phone, 60),
      address: {
        street: text(addr.street), unit: text(addr.unit, 80), city: text(addr.city, 120),
        state: text(addr.state, 80), zip: text(addr.zip, 30), country: text(addr.country, 80),
      },
    },
    fulfillment: {
      method,
      status: text(order.fulfillmentStatus, 40),
      trackingNumber, trackingCarrier: text(order.trackingCarrier, 80), trackingUrl: text(order.trackingUrl, 500),
      shippedDay: shippedAt ? shopDate(new Date(shippedAt)) : null,
      labelSource: order.trackingSource === "inventory-app" ? "inventory-app" : trackingNumber ? "website" : null,
    },
    books,
    firstBook,
    unlinked: fp.unlinked,
  };
  const hash = sha256(stable(body));
  return {
    // The order snapshot's server update time when known (monotonic), else its own updatedAt.
    web: { ...body, hash, sourceUpdatedAt: text(sourceUpdatedAt || order.updatedAt || order.paidAt || "", 40) || null },
    hash,
    net: test ? {} : fp.net,
    lineLinks: fp.lineLinks,
    unlinkedCount: fp.unlinked.reduce((n, row) => n + row.qty, 0),
  };
}

const isDigitalEdition = (book, variant) => variant
  ? variant.digital === true || (variant.format ? DIGITAL_RE.test(String(variant.format)) : (book.digital === true || DIGITAL_RE.test(String(book.format || ""))))
  : book.digital === true || DIGITAL_RE.test(String(book.format || ""));

// ── Suggested matches (mirrors suggestLinks in src/app/admin/inventoryLink.ts; inventoryLinkSuggest.parity.test.ts) ──

const editionKey = (bookId, variantId) => `${bookId}|${variantId || ""}`;

/**
 * An edition's code for matching and the app: its ISBN. A product that isn't a book (plan 10.6) has no ISBN, so its
 * SKU stands in (the size's own, else the product's). A book's editions never use their SKU: the editor numbers
 * them "SKU-2", "SKU-3", which would hide the book's ISBN.
 */
function codeOf(book, variant) {
  if (isBookKind(productKind(book))) return String((variant && variant.isbn) || book.isbn || "");
  return String((variant && (variant.isbn || variant.sku)) || book.isbn || book.sku || "");
}

/** Every printed website book/edition that can be linked (no e-books, box sets or gift cards). */
function linkableEditions(books) {
  const out = [];
  for (const book of books || []) {
    if (!book?.id || isGiftCardProduct(book) || isBundle(book)) continue;
    const variants = Array.isArray(book.variants) ? book.variants.filter(v => v && v.id) : [];
    const base = { bookId: book.id, title: String(book.title || "Untitled"), tracked: book.trackInventory === true, archived: book.status === "archived" };
    if (variants.length) {
      for (const v of variants) {
        if (isDigitalEdition(book, v)) continue;
        out.push({ ...base, key: editionKey(book.id, v.id), variantId: v.id, edition: String(v.name || v.format || "Edition"),
          isbn: codeOf(book, v), stock: whole(v.stockLevel !== undefined ? v.stockLevel : v.stock) });
      }
    } else if (!isDigitalEdition(book, null)) {
      out.push({ ...base, key: editionKey(book.id, null), variantId: null, edition: "", isbn: codeOf(book, null), stock: whole(book.stockLevel) });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || a.edition.localeCompare(b.edition));
}

const isbnDigits = v => String(v || "").replace(/[^0-9Xx]/g, "").toUpperCase();
// A product's own code ("TEE-M", plan 10.6): letters and digits, at least 3, and not an ISBN (matched above).
const skuKey = v => { const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return s.length >= 3 && !/^[0-9X]{10,}$/.test(s) ? s : ""; };
const normTitle = v => String(v || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Suggested inventory book per unlinked edition: the same ISBN (10+ digits), else the same SKU (a
 * product's code, plan 10.6), else exactly the same
 * title ("Title" for a book without editions, "Title Edition" otherwise). Only a single, unused match
 * is suggested — never a guess between two.
 */
function suggestLinks(editions, appBooks, links) {
  const used = new Set(Object.values(links || {}).flatMap(e => Object.values(e || {})));
  const byIsbn = new Map();
  const bySku = new Map();
  const byTitle = new Map();
  for (const b of appBooks || []) {
    const isbn = isbnDigits(b.isbn);
    if (isbn.length >= 10) byIsbn.set(isbn, [...(byIsbn.get(isbn) || []), b]);
    const sku = skuKey(b.isbn);
    if (sku) bySku.set(sku, [...(bySku.get(sku) || []), b]);
    const t = normTitle(b.title);
    if (t) byTitle.set(t, [...(byTitle.get(t) || []), b]);
  }
  const out = {};
  const taken = new Set();
  const pick = list => {
    const free = (list || []).filter(b => !used.has(b.id) && !taken.has(b.id));
    return list && list.length === 1 && free.length === 1 ? free[0].id : null;
  };
  const printedPerBook = new Map();
  editions.forEach(e => printedPerBook.set(e.bookId, (printedPerBook.get(e.bookId) || 0) + 1));
  for (const e of editions) {
    if (linkFor(links, e.bookId, e.variantId)) continue;
    const isbn = isbnDigits(e.isbn);
    const onlyPrinted = printedPerBook.get(e.bookId) === 1;
    const sku = skuKey(e.isbn);
    const id = (isbn.length >= 10 ? pick(byIsbn.get(isbn)) : null)
      || (sku ? pick(bySku.get(sku)) : null)
      || (e.edition ? pick(byTitle.get(normTitle(`${e.title} ${e.edition}`))) : null)
      || (!e.edition || onlyPrinted ? pick(byTitle.get(normTitle(e.title))) : null);
    if (id) { out[e.key] = id; taken.add(id); }
  }
  return out;
}

/**
 * Books the owner can match with one click (Inventory › Inventory app link): suggestions for printed
 * editions not archived and not matched, minus the pairs the owner said "Not these" to (`ignored`,
 * { editionKey: inventoryBookId }), sorted by title.
 */
function newMatchList(books, appBooks, links, ignored = {}) {
  const editions = linkableEditions(books).filter(e => !e.archived);
  const suggestions = suggestLinks(editions, appBooks, links);
  const titleOf = new Map((appBooks || []).map(b => [b.id, String(b.title || b.id).slice(0, 200)]));
  return editions
    .filter(e => suggestions[e.key] && ignored?.[e.key] !== suggestions[e.key])
    .map(e => ({ key: e.key, bookId: e.bookId, variantId: e.variantId, title: e.title.slice(0, 200), edition: e.edition.slice(0, 100),
      inventoryBookId: suggestions[e.key], inventoryTitle: titleOf.get(suggestions[e.key]) || suggestions[e.key] }));
}

/**
 * The stored suggestions still worth offering (mirrors openMatches in src/app/admin/inventoryLink.ts): the
 * edition isn't matched yet, the inventory app book isn't matched to anything yet (accepting it would
 * break a working link) and the owner hasn't said "Not these" to the pair. With no links at all, none.
 */
function openMatches(items, links, ignored = {}) {
  if (!links || !Object.keys(links).length) return [];
  const used = new Set(Object.values(links).flatMap(e => Object.values(e || {})));
  return (Array.isArray(items) ? items : []).filter(m => m && !linkFor(links, m.bookId, m.variantId)
    && !used.has(m.inventoryBookId) && ignored?.[m.key] !== m.inventoryBookId);
}

/**
 * Check and clean a links map against the website catalog (and the inventory catalog's ids when known).
 * An empty value removes a link. Returns { links, errors: [{ bookId, variantId, reason }] }.
 */
function validateLinks(books, links, inventoryIds = null) {
  const byId = new Map((books || []).filter(b => b && b.id).map(b => [b.id, b]));
  const known = inventoryIds ? new Set(inventoryIds) : null;
  const out = {};
  const errors = [];
  const usedBy = new Map();
  for (const [bookId, entry] of Object.entries(links || {})) {
    if (!entry || typeof entry !== "object") continue;
    for (const [key, raw] of Object.entries(entry)) {
      const inv = typeof raw === "string" ? raw.trim() : "";
      if (!inv) continue;
      const variantId = key === "_" ? null : key;
      const fail = reason => errors.push({ bookId, variantId, reason });
      const book = byId.get(bookId);
      if (!book) { fail("This book is no longer in the website catalog."); continue; }
      if (!INVENTORY_ID_RE.test(inv) || (known && !known.has(inv))) { fail("That book is not in the inventory app."); continue; }
      if (isGiftCardProduct(book)) { fail("Gift cards have no stock to link."); continue; }
      if (isBundle(book)) { fail("Box sets follow the books inside them; link those books instead."); continue; }
      const variants = Array.isArray(book.variants) ? book.variants.filter(v => v && v.id) : [];
      let variant = null;
      if (variantId) {
        variant = variants.find(v => v.id === variantId);
        if (!variant) { fail("This edition is no longer on the book."); continue; }
      } else if (variants.length) { fail("This book is sold in editions; link each printed edition."); continue; }
      if (isDigitalEdition(book, variant)) { fail("E-books and audiobooks have no stock to link."); continue; }
      // Editions of one book may share an inventory book: they share one pile of copies (stockPools.js).
      // Two different books may not, or one count would be sold twice.
      const owner = usedBy.get(inv);
      if (owner && (owner.bookId !== bookId || !variantId || !owner.variantId)) { fail(`That inventory book is already linked to “${owner.name}”.`); continue; }
      if (!owner) usedBy.set(inv, { bookId, variantId, name: [book.title || "another book", variant?.name].filter(Boolean).join(" — ") });
      out[bookId] = { ...(out[bookId] || {}), [variantId || "_"]: inv };
    }
  }
  return { links: out, errors };
}

/** Every linked edition: [{ bookId, variantId, inventoryBookId }]. */
function linkedEditions(links) {
  const out = [];
  for (const [bookId, entry] of Object.entries(links || {})) {
    for (const [key, inv] of Object.entries(entry || {})) {
      if (typeof inv === "string" && INVENTORY_ID_RE.test(inv)) out.push({ bookId, variantId: key === "_" ? null : key, inventoryBookId: inv });
    }
  }
  return out;
}

function liveStock(book, variantId) {
  if (!book) return null;
  if (!variantId) return whole(book.stockLevel);
  const v = (Array.isArray(book.variants) ? book.variants : []).find(x => x && x.id === variantId);
  return v ? whole(v.stockLevel !== undefined ? v.stockLevel : v.stock) : null;
}

/**
 * What one linked edition's stock should be. `feed` = websiteStockFeed doc, `webTotal` = website
 * copies counted for that inventory book. Returns { from, to, hold, appAhead, turnsOnTracking }.
 * hold: "missing" | "no-feed" | "not-derived" | "untracked" | "big-change" | null — automatic runs
 * apply only plans without a hold; the owner's confirmed preview applies everything but the first three.
 */
function stockPlanFor({ book, variantId = null, feed, webTotal = 0 }) {
  const from = liveStock(book, variantId);
  if (from == null) return { from: null, to: null, hold: "missing" };
  if (!feed || !Number.isFinite(Number(feed.base)) || !Number.isFinite(Number(feed.onHand))) return { from, to: null, hold: "no-feed" };
  if (feed.derived === false) return { from, to: null, hold: "not-derived" };
  const expected = Math.floor(Number(feed.base)) - whole(webTotal);
  const onHand = whole(feed.onHand);
  const to = Math.max(0, Math.min(expected, onHand));
  const appAhead = expected > onHand;
  const turnsOnTracking = book.trackInventory !== true;
  const change = Math.abs(to - from);
  const big = change > Math.max(10, Math.ceil(from * 0.5)) || (to === 0 && from > 10);
  const hold = turnsOnTracking ? "untracked" : big ? "big-change" : null;
  return { from, to, hold, appAhead, turnsOnTracking };
}

/** The same patch as the admin's planStockChange: an edition's stock and stockLevel, or the book's stockLevel. */
function stockPatch(book, variantId, to, { track = false } = {}) {
  const value = whole(to);
  const patch = variantId
    ? { variants: (book.variants || []).map(v => (v && v.id === variantId ? { ...v, stockLevel: value, stock: value } : v)) }
    : { stockLevel: value };
  if (track && book.trackInventory !== true) patch.trackInventory = true;
  return patch;
}

/** The inventory app's settings/catalog, reduced to what the website may see (never author passwords or links). */
function projectInventoryCatalog(doc) {
  let parsed = doc && doc.data;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const out = [];
  for (const [key, book] of Object.entries(parsed)) {
    if (key.startsWith("_") || !book || typeof book !== "object") continue;
    const id = text(book.id || key, 120);
    if (!INVENTORY_ID_RE.test(id)) continue;
    out.push({
      id, title: text(book.title, 200) || id, author: text(book.author, 200),
      isbn: text(book.isbn, 40).replace(/^—$/, ""), currency: text(book.currency, 8),
      maxPrint: Number.isFinite(Number(book.maxPrint)) ? Number(book.maxPrint) : null,
      price: Number(book.listPrice) > 0 ? Math.round(Number(book.listPrice) * 100) / 100 : null,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/* ── One to-do list and new books (docs/INVENTORY_LINK.md › One to-do list and new books) ── */

const MAX_SHOP_BOOKS = 200;
const MAX_APP_ONLY = 100;
const MAX_TODO = 10;
const REPLY_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const positivePrice = value => (Number(value) > 0 ? Math.round(Number(value) * 100) / 100 : null);
const usedInventoryIds = links => new Set(Object.values(links || {}).flatMap(e => Object.values(e || {})));

/** A small https copy of a book's first photo for the app's list ("" when none). */
function smallCover(book) {
  const first = Array.isArray(book?.photos) ? book.photos.find(p => p && !p.videoUrl) : null;
  // Older books keep a photo as a plain address, or only the old coverImage field.
  const photo = typeof first === "string" ? { url: first } : first || (book?.coverImage ? { url: String(book.coverImage) } : null);
  if (!photo) return "";
  const copies = String(photo.srcset || "").split(",").map(part => {
    const [url, width] = part.trim().split(/\s+/);
    return { url, width: parseInt(width, 10) || 0 };
  }).filter(c => /^https:\/\//.test(c.url || "") && c.width > 0).sort((a, b) => a.width - b.width);
  const url = (copies.find(c => c.width >= 240) || copies[copies.length - 1] || {}).url || photo.url || "";
  return /^https:\/\//.test(url) ? text(url, 1000) : "";
}

const bookState = (book, now = Date.now()) => {
  if (book?.status === "draft") return "draft";
  const at = Date.parse(book?.scheduleDate || "");
  return Number.isFinite(at) && at > now ? "scheduled" : "published";
};

/** Live match suggestions (pairs the owner hasn't said "Not these" to), by edition key. */
function liveSuggestions(editions, appBooks, links, ignoredMatches = {}) {
  const all = suggestLinks(editions, appBooks, links);
  return Object.fromEntries(Object.entries(all).filter(([key, id]) => ignoredMatches?.[key] !== id));
}

/**
 * Printed website editions the inventory app doesn't have: not matched, not archived, not a match suggestion
 * (those are offered as matches instead) and not dismissed in the app. `websiteLink/catalog.books`.
 */
function shopBooksForApp(books, appBooks, links, { ignoredMatches = {}, dismissed = {}, now = Date.now() } = {}) {
  const editions = linkableEditions(books).filter(e => !e.archived);
  const suggested = liveSuggestions(editions, appBooks, links, ignoredMatches);
  const byId = new Map((books || []).map(b => [b.id, b]));
  return editions
    .filter(e => !linkFor(links, e.bookId, e.variantId) && !suggested[e.key] && !(dismissed && dismissed[e.key]))
    .slice(0, MAX_SHOP_BOOKS)
    .map(e => {
      const book = byId.get(e.bookId) || {};
      const variant = e.variantId ? (book.variants || []).find(v => v && v.id === e.variantId) : null;
      return {
        key: e.key, bookId: e.bookId, variantId: e.variantId, title: text(e.title, 200), edition: text(e.edition, 100),
        author: text(book.subtitle || book.authorName, 200), isbn: text(e.isbn, 40),
        price: positivePrice(variant ? variant.price : book.retailPrice), cover: smallCover(book), status: bookState(book, now),
        // Plan 10.5: an edition of a product sold in options (sizes, colours) names its product, so the app can keep
        // the sizes together and add them all at once. A book with plain editions sends none, as before.
        ...(variant && usesOptionPicker(book) ? { product: text(book.title, 200) } : {}),
      };
    });
}

/**
 * The inventory app's books no website edition is matched to, that aren't a match suggestion and that the owner
 * hasn't marked "Not for the shop". `systemStatus/inventoryLink.appOnlyBooks.items`.
 */
function appBooksForShop(books, appBooks, links, { ignoredMatches = {}, ignoredAppBooks = {} } = {}) {
  const used = usedInventoryIds(links);
  const editions = linkableEditions(books).filter(e => !e.archived);
  const suggested = new Set(Object.values(liveSuggestions(editions, appBooks, links, ignoredMatches)));
  return (appBooks || [])
    .filter(b => b && INVENTORY_ID_RE.test(b.id) && !used.has(b.id) && !suggested.has(b.id) && !(ignoredAppBooks && ignoredAppBooks[b.id]))
    .slice(0, MAX_APP_ONLY)
    .map(b => ({ id: b.id, title: text(b.title, 200) || b.id, author: text(b.author, 200), isbn: text(b.isbn, 40), price: positivePrice(b.price), currency: text(b.currency, 8) }));
}

/**
 * The app's "Add to the app" requests, checked with Match these' guards. Returns { adds, replies }: the links to add
 * and the answers to write (`websiteLink/website.linkReplies`). A request already answered for the same app book is
 * skipped; one whose app book the catalog can't see yet gets no answer, so the next sweep tries again.
 */
function linkRequestPlan({ requests, replies = {}, links = {}, books = [], appBookIds = [], now = new Date() }) {
  const at = now.toISOString();
  const editions = new Map(linkableEditions(books).map(e => [e.key, e]));
  const used = usedInventoryIds(links);
  const known = new Set(appBookIds || []);
  const adds = [];
  const out = {};
  for (const [key, request] of Object.entries(requests && typeof requests === "object" ? requests : {}).slice(0, 300)) {
    const inventoryBookId = typeof request?.inventoryBookId === "string" ? request.inventoryBookId.trim() : "";
    if (key.length > 300 || !INVENTORY_ID_RE.test(inventoryBookId)) continue;
    if (replies?.[key]?.inventoryBookId === inventoryBookId) continue;
    const edition = editions.get(key);
    const answer = (result, reason) => { out[key] = { inventoryBookId, result, reason, at }; };
    if (!edition) { answer("refused", "This book isn't on the website as a printed book any more."); continue; }
    if (edition.archived) { answer("refused", "This book is archived on the website. Bring it back there, then match it on the website's Inventory app link page."); continue; }
    const current = linkFor(links, edition.bookId, edition.variantId);
    if (current === inventoryBookId) { answer("linked", "Linked on the website."); continue; }
    if (current) { answer("refused", "This website book is already matched to another book in the app. Change it on the website's Inventory app link page."); continue; }
    if (!known.has(inventoryBookId)) continue;
    if (used.has(inventoryBookId)) { answer("refused", "This book in the app is already matched to another website book."); continue; }
    used.add(inventoryBookId);
    adds.push({ key, bookId: edition.bookId, variantId: edition.variantId, inventoryBookId });
    answer("linked", "Linked on the website.");
  }
  return { adds, replies: out };
}

/**
 * Answers to keep. An answer stays while the app still lists its request (so a request is never applied twice,
 * e.g. after the owner unmatched the book on purpose), and for 30 days after the app drops it.
 */
function keptReplies(replies, now = new Date(), requests = null) {
  const cutoff = now.getTime() - REPLY_KEEP_MS;
  const listed = requests && typeof requests === "object" ? requests : {};
  return Object.fromEntries(Object.entries(replies || {}).filter(([key, r]) => r && (listed[key] || Date.parse(r.at) > cutoff)));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** What waits on the website, for the app's To-do list (`websiteLink/website.todo`). */
function websiteTodo({ holds = [], newMatches = 0, appOnly = 0, adminUrl, now = new Date() }) {
  const href = `${String(adminUrl || "").replace(/\/+$/, "")}#inventory/link`;
  const items = [];
  const heldBooks = new Set((holds || []).map(h => h && h.bookId).filter(Boolean)).size;
  if (heldBooks) items.push({ id: "stock-held", count: heldBooks, title: `Stock for ${plural(heldBooks, "book waits", "books wait")} for your OK on the website`, href });
  if (newMatches > 0) items.push({ id: "new-matches", count: newMatches, title: `${plural(newMatches, "website book looks", "website books look")} like a book in this app. Match ${newMatches === 1 ? "it" : "them"} on the website`, href });
  if (appOnly > 0) items.push({ id: "app-books", count: appOnly, title: `${plural(appOnly, "book here isn't", "books here aren't")} in the shop yet`, href });
  return { at: now.toISOString(), items: items.slice(0, MAX_TODO) };
}

/** The app's own to-do (`websiteLink/app.todo`), cleaned: text only, a safe #hash, at most 10. */
const WEBSITE_TODO_IDS = new Set(["stock-held", "new-matches", "app-books"]);
function cleanAppTodo(todo) {
  // Only the app's own items: the website's own (which the app also lists) must not come back as "in the app".
  const items = (Array.isArray(todo?.items) ? todo.items : []).filter(item => !WEBSITE_TODO_IDS.has(String(item?.id || "")));
  return {
    at: typeof todo?.at === "string" ? todo.at.slice(0, 40) : null,
    items: items.slice(0, MAX_TODO).map(item => ({
      id: text(item?.id, 60).replace(/[^A-Za-z0-9_-]/g, ""),
      count: Math.max(0, Math.min(9999, Math.floor(Number(item?.count) || 0))),
      title: text(item?.title, 200),
      hash: /^#[A-Za-z0-9_=-]{1,100}$/.test(String(item?.hash || "")) ? String(item.hash) : "#todo",
    })).filter(item => item.id && item.title),
  };
}

/* ── Book details in step, and one search (docs/INVENTORY_LINK.md › Book details in step, and one search) ── */

const MAX_LINKED = 500;
const MAX_DETAILS = 100;
const MAX_APP_INDEX = 1000;
const DETAIL_FIELDS = ["title", "author", "isbn", "price"];

/** Every printed website edition matched to an app book, for the app (`websiteLink/catalog.linked`). */
function linkedForApp(books, links) {
  const byId = new Map((books || []).map(b => [b.id, b]));
  const rows = linkableEditions(books).map(e => ({ e, inventoryBookId: linkFor(links, e.bookId, e.variantId) })).filter(r => r.inventoryBookId);
  const shared = new Map();
  for (const r of rows) shared.set(r.inventoryBookId, (shared.get(r.inventoryBookId) || 0) + 1);
  return rows.slice(0, MAX_LINKED).map(({ e, inventoryBookId }) => {
    const book = byId.get(e.bookId) || {};
    const variant = e.variantId ? (book.variants || []).find(v => v && v.id === e.variantId) : null;
    return {
      key: e.key, bookId: e.bookId, variantId: e.variantId, inventoryBookId, title: text(book.title, 200), edition: text(e.edition, 100),
      author: text(book.subtitle || book.authorName, 200), isbn: text(e.isbn, 40),
      // An edition sells at its own price only (no price = can't be bought), so never fall back to the book's.
      price: positivePrice(e.variantId ? variant && variant.price : book.retailPrice),
      sharedWith: shared.get(inventoryBookId),
    };
  });
}

/** A value tidied for comparing (see the contract): spaces folded, ISBN bare, price with two decimals. */
function detailValue(field, value) {
  if (field === "price") return Number(value) > 0 ? (Math.round(Number(value) * 100) / 100).toFixed(2) : "";
  const v = String(value ?? "").trim().replace(/\s+/g, " ");
  if (field === "isbn") return v === "—" ? "" : v.replace(/[\s-]+/g, "").toUpperCase();
  return v;
}

/**
 * The book details the two apps disagree on (the rule both apps share; tested against docs/link-details-fixture.json).
 * `kept` ({ id: signature }, "Leave as is") is left out before the list is cut to 100, so kept rows never hide later ones.
 */
function detailDifferences(linked, appBooks, kept = {}) {
  const app = new Map((appBooks || []).filter(b => b && b.id).map(b => [b.id, b]));
  const groups = new Map();
  for (const row of linked || []) {
    if (!row || !row.inventoryBookId) continue;
    if (!groups.has(row.inventoryBookId)) groups.set(row.inventoryBookId, []);
    groups.get(row.inventoryBookId).push(row);
  }
  const out = [];
  for (const [inventoryBookId, rows] of groups) {
    const theirs = app.get(inventoryBookId);
    if (!theirs || new Set(rows.map(r => r.bookId)).size > 1) continue;
    const first = rows[0];
    const single = Number(first.sharedWith) === 1;
    // Canadian dollars, as the admin's shopDraftFrom reads the app's currency.
    const cad = /^(|cad|ca\$|c\$|\$)$/i.test(String(theirs.currency || "").trim());
    for (const field of DETAIL_FIELDS) {
      if ((field === "isbn" || field === "price") && !single) continue;
      if (field === "price" && !cad) continue;
      const shop = detailValue(field, first[field]);
      const theirValue = detailValue(field, theirs[field]);
      if (shop === theirValue) continue;
      if (kept && kept[`${inventoryBookId}|${field}`] === JSON.stringify([shop, theirValue])) continue;
      out.push({ id: `${inventoryBookId}|${field}`, inventoryBookId, bookId: first.bookId, variantId: single ? (first.variantId || null) : null,
        field, title: text(first.title, 200), shop, app: theirValue });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || DETAIL_FIELDS.indexOf(a.field) - DETAIL_FIELDS.indexOf(b.field)).slice(0, MAX_DETAILS);
}

/** A difference's signature: a "Leave as is" choice holds until either value changes. */
const detailSignature = d => JSON.stringify([d.shop, d.app]);

/** The app's books for the website admin's search (`systemStatus/inventoryLink.appBookIndex.items`). */
function appBookIndex(appBooks) {
  return (appBooks || []).filter(b => b && INVENTORY_ID_RE.test(b.id)).slice(0, MAX_APP_INDEX)
    .map(b => ({ id: b.id, title: text(b.title, 200) || b.id, author: text(b.author, 200), isbn: text(b.isbn, 40).replace(/^—$/, "") }));
}

/** The patch "Use the app's" writes to the website book, or null when the field can't be written. */
function detailPatch(book, diff) {
  if (!book || !diff || !diff.app) return null;
  const variants = Array.isArray(book.variants) ? book.variants : [];
  const variant = diff.variantId ? variants.find(v => v && v.id === diff.variantId) : null;
  if (diff.variantId && !variant) return null;
  const withVariant = fields => ({ variants: variants.map(v => (v && v.id === diff.variantId ? { ...v, ...fields } : v)) });
  if (diff.field === "title") return { title: diff.app };
  if (diff.field === "author") return { subtitle: diff.app };
  if (diff.field === "isbn" && !isBookKind(productKind(book))) {
    // A product that isn't a book shows its SKU here (codeOf): the code goes back where it came from.
    if (variant && !String(variant.isbn || "").trim()) return withVariant({ sku: diff.app });
    if (!variant && !String(book.isbn || "").trim()) return { sku: diff.app };
  }
  if (diff.field === "isbn") return variant && String(variant.isbn || "").trim() ? withVariant({ isbn: diff.app }) : { isbn: diff.app };
  if (diff.field === "price") {
    const price = Number(diff.app);
    if (!(price > 0)) return null;
    return variant ? withVariant({ price }) : { retailPrice: price };
  }
  return null;
}

module.exports = {
  WEB_VERSION, websiteOrderNumber, paidDayOf, countsForInventory, pushKind, linkFor, lineKey, splitCents,
  orderFootprint, websiteOrder, stable, validateLinks, linkedEditions, liveStock, stockPlanFor, stockPatch,
  projectInventoryCatalog, isDigitalEdition, linkableEditions, suggestLinks, newMatchList, openMatches,
  smallCover, shopBooksForApp, appBooksForShop, linkRequestPlan, keptReplies, websiteTodo, cleanAppTodo,
  linkedForApp, detailValue, detailDifferences, detailSignature, appBookIndex, detailPatch,
};
