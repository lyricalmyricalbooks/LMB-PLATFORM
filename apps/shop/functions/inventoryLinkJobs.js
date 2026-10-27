// Website ↔ inventory app link: the jobs (docs/INVENTORY_LINK.md). Dependencies come in as `deps`
// so tests can run every step against in-memory fakes:
//   deps.db     — the website's Firestore (Admin SDK)
//   deps.store  — the inventory project's link documents (inventoryLinkStore.js)
//   deps.now()  — the clock
//   deps.sumNet(invId) — website copies counted for an inventory book (Firestore sum() by default)
//
// Order of trust: the website changes a linked book's stock only to the number the inventory app's
// own count gives (stockPlanFor). It never marks an order paid, refunds it, or touches a provider.
const crypto = require("crypto");
const { FieldPath, FieldValue, AggregateField } = require("firebase-admin/firestore");
const {
  pushKind, websiteOrder, linkedEditions, stockPlanFor, stockPatch, liveStock, stable, isDigitalEdition, newMatchList, openMatches,
  validateLinks, shopBooksForApp, appBooksForShop, linkRequestPlan, keptReplies, websiteTodo, cleanAppTodo,
  linkedForApp, detailDifferences, appBookIndex,
} = require("./inventoryLink");
const { externalDispatchProblem } = require("./fulfillmentGuard");
const { catalogUnitPrice } = require("./catalogPrice");
const { runInBatches } = require("./sweepLimits");

const STATE_DOC = ["systemStatus", "inventoryLink"];
const LEASE_MS = 4 * 60 * 1000;
const STOCK_EVERY_MS = 15 * 60 * 1000;
const CATCH_UP_MARGIN_MS = 15 * 60 * 1000;
const FIRST_CATCH_UP_MS = 2 * 24 * 60 * 60 * 1000;
const BACKFILL_PAGE = 100;
const REHEARSAL_MS = 24 * 60 * 60 * 1000;
// How often the sweep looks for website books it can suggest a match for (new books, mostly).
const MATCH_EVERY_MS = 60 * 60 * 1000;
// Holds only the owner can clear (adminAlerts.ts inventoryLinkAlerts names the same three).
const OWNER_HOLDS = new Set(["big-change", "not-derived", "now-has-editions"]);
// An automatic run may apply these; the owner's confirmed preview also applies "untracked" and "big-change".
const CONFIRMED_HOLDS = new Set([null, "untracked", "big-change"]);

const iso = date => date.toISOString();
const errText = err => String((err && err.message) || err || "").slice(0, 300);
const stateRef = db => db.collection(STATE_DOC[0]).doc(STATE_DOC[1]);
const rehearsalOn = (state, now) => !!state.rehearsalUntil && Date.parse(state.rehearsalUntil) > now.getTime();
const salesOn = state => typeof state.startDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.startDay);
// Firestore Timestamps: is a later than b?
const later = (a, b) => !!a && !!b && (a.seconds - b.seconds || a.nanoseconds - b.nanoseconds) > 0;

async function readState(db) {
  const snap = await stateRef(db).get();
  return snap.exists ? snap.data() : {};
}

// Box-set parts from the catalog: a set's price is shared by its parts in proportion to their prices,
// and an e-book part has no copies to count.
async function partInfo(db, order) {
  const ids = new Set();
  for (const item of order.items || []) for (const part of Array.isArray(item?.components) ? item.components : []) if (part?.id) ids.add(part.id);
  if (!ids.size) return { price: () => 0, digital: () => false };
  const snaps = await db.getAll(...[...ids].map(id => db.collection("books").doc(id)));
  const books = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));
  const find = (bookId, variantId) => {
    const book = books.get(bookId);
    return { book, variant: book && variantId ? (book.variants || []).find(v => v && v.id === variantId) || null : null };
  };
  return {
    price: (bookId, variantId) => {
      const { book, variant } = find(bookId, variantId);
      const price = book ? catalogUnitPrice(book, variant) : NaN;
      return Number.isFinite(price) && price > 0 ? price : 0;
    },
    digital: (bookId, variantId) => {
      const { book, variant } = find(bookId, variantId);
      return !!book && isDigitalEdition(book, variant);
    },
  };
}

/**
 * Send one order's current state to the inventory app. The website's own record (inventoryPushes) is
 * written first, so its copy count is right even while the inventory project can't be reached; the
 * sweep retries undelivered records. Returns { status, net?, error? }.
 */
async function pushOrder(deps, orderId, state) {
  const { db, store } = deps;
  const now = deps.now();
  const orderRef = db.collection("orders").doc(orderId);
  const recordRef = db.collection("inventoryPushes").doc(orderId);
  const [orderSnap, recordSnap] = await Promise.all([orderRef.get(), recordRef.get()]);
  if (!orderSnap.exists) return { status: "missing" };
  const order = orderSnap.data();
  const record = recordSnap.exists ? recordSnap.data() : null;
  const kind = pushKind(order, { startDay: state.startDay, rehearsal: rehearsalOn(state, now), record });
  if (!kind) return { status: "skipped" };
  const parts = await partInfo(db, order);
  const built = websiteOrder(order, {
    orderId, links: state.links || {}, frozen: record?.lineLinks, partPrice: parts.price, partDigital: parts.digital, test: kind === "test",
    sourceUpdatedAt: orderSnap.updateTime ? orderSnap.updateTime.toDate().toISOString() : null,
  });
  const local = await db.runTransaction(async tx => {
    const snap = await tx.get(recordRef);
    const cur = snap.exists ? snap.data() : null;
    if (cur?.sourceUpdatedAt && built.web.sourceUpdatedAt && cur.sourceUpdatedAt > built.web.sourceUpdatedAt) return "older";
    if (cur && cur.hash === built.hash && cur.delivered === true) return "same";
    tx.set(recordRef, {
      orderId, test: kind === "test", net: built.net, lineLinks: built.lineLinks, hash: built.hash,
      sourceUpdatedAt: built.web.sourceUpdatedAt, paidAt: order.paidAt || null, unlinkedCount: built.unlinkedCount,
      delivered: false, error: null, createdAt: cur?.createdAt || iso(now), updatedAt: iso(now),
    });
    return "recorded";
  });
  if (local !== "recorded") return { status: local, net: built.net };
  try {
    const remote = await store.writeWebsiteOrder(orderId, built.web);
    await db.runTransaction(async tx => {
      const snap = await tx.get(recordRef);
      if (snap.exists && snap.data().hash === built.hash) tx.update(recordRef, { delivered: true, deliveredAt: iso(now), remote });
    });
    return { status: "delivered", remote, net: built.net };
  } catch (err) {
    await recordRef.update({ error: errText(err), errorAt: iso(now) }).catch(() => {});
    return { status: "failed", error: errText(err), net: built.net };
  }
}

// Push a list of orders a few at a time. `delivered` = how many reached the inventory app; `undelivered`
// = recorded on the website but not sent (retried later; the copy count is already right); `errors` =
// pushes that stopped before recording anything, so the website's copy count may be missing them.
async function pushMany(deps, state, ids, deadline) {
  let undelivered = 0;
  const run = await runInBatches(ids, 5, async id => {
    const result = await pushOrder(deps, id, state);
    if (result.status === "failed") undelivered += 1;
  }, { deadline, now: () => deps.now().getTime() });
  return { pushed: run.processed, undelivered, errors: run.failed, skipped: run.skipped.length };
}

const CATCH_UP_PAGE = 300;

/**
 * Push every order that may have changed since `sinceIso`, plus undelivered records. `complete` is true
 * only when every such order was recorded: otherwise the website's copy count may be short, and stock is
 * left alone this run. `resumeAt` is where the next run continues when a window had more orders than one
 * page (the windows are read oldest change first).
 */
async function catchUp(deps, state, sinceIso, { deadline = Infinity } = {}) {
  const { db } = deps;
  const [byUpdate, byPaid, undelivered] = await Promise.all([
    db.collection("orders").where("updatedAt", ">=", sinceIso).orderBy("updatedAt").limit(CATCH_UP_PAGE).get(),
    db.collection("orders").where("paidAt", ">=", sinceIso).orderBy("paidAt").limit(CATCH_UP_PAGE).get(),
    db.collection("inventoryPushes").where("delivered", "==", false).limit(100).get(),
  ]);
  const resumeAt = [[byUpdate, "updatedAt"], [byPaid, "paidAt"]]
    .filter(([snap]) => snap.size >= CATCH_UP_PAGE)
    .map(([snap, field]) => String(snap.docs[snap.docs.length - 1].get(field)))
    .sort()[0] || null;
  const ids = [...new Set([byUpdate, byPaid, undelivered].flatMap(snap => snap.docs.map(doc => doc.id)))];
  const run = await pushMany(deps, state, ids, deadline);
  return { ...run, resumeAt, complete: !resumeAt && !run.skipped && !run.errors };
}

/**
 * After the owner matched more books: push again, a page at a time, every order with copies that had no
 * match (links already used stay frozen). Returns { cursor, done, complete }.
 */
async function relinkBatch(deps, state, { deadline = Infinity } = {}) {
  const { db } = deps;
  let query = db.collection("inventoryPushes").orderBy(FieldPath.documentId()).limit(CATCH_UP_PAGE);
  if (state.relinkCursor) query = query.startAfter(state.relinkCursor);
  const snap = await query.get();
  const ids = snap.docs.filter(doc => Number(doc.get("unlinkedCount")) > 0).map(doc => doc.id);
  const run = await pushMany(deps, state, ids, deadline);
  const finished = !run.skipped && !run.errors;
  const done = finished && snap.size < CATCH_UP_PAGE;
  return {
    ...run,
    done,
    cursor: done ? null : finished && snap.size ? snap.docs[snap.docs.length - 1].id : state.relinkCursor || null,
  };
}

/** One page of past orders (oldest first) since the start day. */
async function backfillBatch(deps, state, { deadline = Infinity } = {}) {
  const { db } = deps;
  const backfill = state.backfill || {};
  // A day early in UTC: pushKind decides on the Toronto day.
  const from = new Date(Date.parse(`${state.startDay}T00:00:00.000Z`) - 24 * 60 * 60 * 1000).toISOString();
  let query = db.collection("orders").where("paidAt", ">=", from).orderBy("paidAt").orderBy(FieldPath.documentId()).limit(BACKFILL_PAGE);
  if (backfill.cursor?.paidAt && backfill.cursor?.id) query = query.startAfter(backfill.cursor.paidAt, backfill.cursor.id);
  const snap = await query.get();
  let failed = 0;
  let errors = 0;
  const docs = [];
  for (const doc of snap.docs) {
    if (deps.now().getTime() >= deadline) break;
    try {
      const result = await pushOrder(deps, doc.id, state);
      if (result.status === "failed") failed += 1;
    } catch (err) {
      // Not recorded: stop here so this order is read again next run.
      errors += 1;
      break;
    }
    docs.push(doc);
  }
  const last = docs[docs.length - 1];
  const done = !errors && docs.length === snap.size && snap.size < BACKFILL_PAGE;
  return {
    backfill: {
      ...backfill, from: state.startDay, done,
      cursor: last ? { paidAt: last.get("paidAt"), id: last.id } : backfill.cursor || null,
      sent: (Number(backfill.sent) || 0) + docs.length,
    },
    failed, errors,
  };
}

async function defaultSumNet(db, inv) {
  const snap = await db.collection("inventoryPushes").aggregate({ n: AggregateField.sum(new FieldPath("net", inv)) }).get();
  return Number(snap.data().n) || 0;
}

/** Old → new stock for every linked edition (nothing written). */
async function planStock(deps, state) {
  const { db, store } = deps;
  const editions = linkedEditions(state.links);
  const invIds = [...new Set(editions.map(e => e.inventoryBookId))];
  const bookIds = [...new Set(editions.map(e => e.bookId))];
  const sumNet = deps.sumNet || (inv => defaultSumNet(db, inv));
  const [feeds, totals, bookSnaps] = await Promise.all([
    store.readFeeds(invIds),
    Promise.all(invIds.map(async inv => [inv, await sumNet(inv)])).then(Object.fromEntries),
    bookIds.length ? db.getAll(...bookIds.map(id => db.collection("books").doc(id))) : [],
  ]);
  const books = new Map(bookSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));
  const rows = editions.map(edition => {
    const inv = edition.inventoryBookId;
    const book = books.get(edition.bookId);
    const feed = feeds[inv] || null;
    const variant = edition.variantId ? (book?.variants || []).find(v => v && v.id === edition.variantId) : null;
    const plan = book ? stockPlanFor({ book, variantId: edition.variantId, feed, webTotal: totals[inv] || 0 }) : { from: null, to: null, hold: "missing" };
    // A book linked as a whole that is now sold in editions: its sales belong to the editions now.
    if (plan.to != null && !edition.variantId && (book?.variants || []).some(v => v && v.id)) plan.hold = "now-has-editions";
    // Turning stock counting on for a book sold in editions also limits its other editions to their own
    // counts (e-books included): only when every edition is a printed one matched to the inventory app.
    if (plan.hold === "untracked" && edition.variantId) {
      const editions = (book?.variants || []).filter(v => v && v.id);
      const allMatched = editions.every(v => !isDigitalEdition(book, v) && state.links?.[edition.bookId]?.[v.id]);
      if (!allMatched) plan.hold = "untracked-mixed";
    }
    return {
      ...edition, title: String(book?.title || "").slice(0, 200), edition: String(variant?.name || "").slice(0, 120),
      ...plan, appOnHand: feed ? Number(feed.onHand) : null, feedAt: feed?.at || null,
      webCopies: feed ? Number(feed.webCopies) || 0 : null, webTotal: totals[inv] || 0,
    };
  });
  const hash = crypto.createHash("sha256").update(stable(rows.map(r => [r.bookId, r.variantId, r.inventoryBookId, r.from, r.to, r.hold]))).digest("hex");
  return { rows, hash };
}

/**
 * Write the planned numbers. Each book is one transaction that re-reads it and skips it when anything
 * changed it after the run started (t0) — a sale paid a moment ago is never undone — or its count no
 * longer matches the plan. mode "auto" applies only rows without a hold; "confirmed" (the owner pressed
 * Apply on this preview) also turns stock counting on and applies big changes.
 */
async function applyStock(deps, rows, { t0 = null, mode = "auto", by = "Inventory app link" } = {}) {
  const { db } = deps;
  const allowed = mode === "confirmed" ? row => CONFIRMED_HOLDS.has(row.hold) : row => row.hold == null;
  const byBook = new Map();
  // The owner's confirmed apply also switches counting on for a book whose number is already right:
  // skipping "no change" rows left such a book uncounted however often they pressed Apply.
  const switchesOn = row => mode === "confirmed" && row.hold === "untracked";
  for (const row of rows) {
    if (row.to == null || row.from == null || (row.to === row.from && !switchesOn(row)) || !allowed(row)) continue;
    byBook.set(row.bookId, [...(byBook.get(row.bookId) || []), row]);
  }
  const results = [];
  for (const [bookId, bookRows] of byBook) {
    const ref = db.collection("books").doc(bookId);
    const now = iso(deps.now());
    try {
      const outcome = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return bookRows.map(row => ({ row, result: "missing" }));
        if (t0 && later(snap.updateTime, t0)) return bookRows.map(row => ({ row, result: "changed" }));
        let book = snap.data();
        const done = [];
        const logs = [];
        let patch = {};
        for (const row of bookRows) {
          const from = liveStock(book, row.variantId);
          if (from !== row.from) { done.push({ row, result: "changed" }); continue; }
          const change = stockPatch(book, row.variantId, row.to, { track: mode === "confirmed" });
          patch = { ...patch, ...change };
          book = { ...book, ...change };
          logs.push({
            bookId, variantId: row.variantId || null, title: row.title, edition: row.edition, from, to: row.to, delta: row.to - from,
            reason: "Inventory app", note: `${switchesOn(row) && from === row.to ? "Counting switched on. " : ""}The inventory app counts ${row.appOnHand ?? "?"} on hand${row.webTotal - (row.webCopies || 0) > 0 ? `; ${row.webTotal - (row.webCopies || 0)} website cop${row.webTotal - (row.webCopies || 0) === 1 ? "y" : "ies"} not imported there yet` : ""}.`,
            at: now, by,
          });
          done.push({ row, result: "applied" });
        }
        if (logs.length) {
          tx.update(ref, { ...patch, updatedAt: now });
          logs.forEach(log => tx.set(db.collection("inventoryLog").doc(), log));
        }
        return done;
      });
      results.push(...outcome);
    } catch (err) {
      results.push(...bookRows.map(row => ({ row, result: "failed", error: errText(err) })));
    }
  }
  return results.map(({ row, result, error }) => ({
    bookId: row.bookId, variantId: row.variantId, inventoryBookId: row.inventoryBookId, title: row.title, edition: row.edition,
    from: row.from, to: row.to, result, ...(error ? { error } : {}),
  }));
}

const cleanUrl = value => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) ? url.toString().slice(0, 500) : ""; } catch { return ""; }
};

/**
 * A label the inventory app bought for a website order: attach its tracking (label only) or dispatch
 * the order (marked shipped there), with Orders › Dispatch's safety checks. Test orders are only
 * checked. Every outcome is answered in the inventory app (shipmentReply). Returns { result, reason }.
 */
async function applyAppShipment(deps, { id: orderId, shipment }) {
  const { db, store } = deps;
  const now = deps.now();
  const answer = async (result, reason) => {
    await store.replyShipment(orderId, shipment?.hash, { result, reason, now });
    return { orderId, result, reason };
  };
  if (!shipment || typeof shipment.hash !== "string" || !shipment.hash) return { orderId, result: "ignored", reason: "no shipment" };
  const trackingNumber = String(shipment.trackingNumber || "").trim().slice(0, 100);
  const trackingCarrier = String(shipment.carrier || "").trim().slice(0, 80) || "Carrier";
  const trackingUrl = cleanUrl(shipment.trackingUrl);
  if (!trackingNumber) return answer("refused", "The label has no tracking number, so the website can't share it with the customer.");
  const shipped = !!shipment.shippedAt;
  const orderRef = db.collection("orders").doc(orderId);
  const opsRef = db.collection("order-operations").doc(orderId);
  let outcome;
  try {
    outcome = await db.runTransaction(async tx => {
      const [snap, opsSnap] = await Promise.all([tx.get(orderRef), tx.get(opsRef)]);
      if (!snap.exists) return { result: "refused", reason: "This order no longer exists on the website." };
      const order = snap.data();
      const operations = opsSnap.exists ? opsSnap.data() : {};
      const sameTracking = String(order.trackingNumber || "").trim() === trackingNumber;
      const dispatched = ["shipped", "out_for_delivery", "delivered", "collected"].includes(order.fulfillmentStatus) || order.status === "completed";
      if (order.isTest === true) {
        const problem = externalDispatchProblem({ ...order, isTest: false }, operations);
        return { result: "checked", reason: problem
          ? `Test order — the website would refuse: ${problem}`
          : `Test order — the website would ${shipped ? "dispatch it and email the customer" : "attach this tracking"}. Nothing was changed.` };
      }
      if (dispatched && sameTracking) return { result: "dispatched", reason: "Already dispatched with this tracking." };
      // A label the website bought (or one already sent) can't be silently replaced by another parcel.
      if (order.trackingNumber && !sameTracking && (order.labelUrl || order.trackingSource !== "inventory-app" || dispatched)) {
        return { result: "refused", reason: `The website already has tracking ${order.trackingNumber} for this order. Void one of the two labels, then send the one you're using.` };
      }
      const problem = externalDispatchProblem(order, operations);
      if (problem) return { result: "refused", reason: problem };
      if (!shipped && sameTracking) return { result: "attached", reason: "Tracking is on the order. Mark the parcel shipped when it leaves." };
      const at = iso(now);
      const label = {
        source: String(shipment.labelSource || "inventory-app").slice(0, 30), carrier: trackingCarrier, service: String(shipment.service || "").slice(0, 120),
        trackingNumber, cost: Number.isFinite(Number(shipment.labelCostCAD)) ? Math.round(Number(shipment.labelCostCAD) * 100) / 100 : null,
        boughtAt: typeof shipment.boughtAt === "string" ? shipment.boughtAt.slice(0, 40) : null, receivedAt: at,
      };
      const history = order.trackingNumber && !sameTracking
        ? [...(operations.labelHistory || []), { trackingNumber: order.trackingNumber, trackingCarrier: order.trackingCarrier || null, replacedAt: at, replacedBy: "inventory-app" }]
        : operations.labelHistory || [];
      const message = shipped
        ? `Dispatched from the inventory app via ${trackingCarrier}. Tracking: ${trackingNumber}`
        : `Label bought in the inventory app: ${trackingCarrier} ${trackingNumber}.`;
      tx.update(orderRef, {
        trackingNumber, trackingCarrier, trackingUrl, trackingSource: "inventory-app",
        ...(shipped ? { status: "completed", fulfillmentStatus: "shipped", shippedAt: at } : {}),
        updatedAt: at,
      });
      tx.set(opsRef, {
        ...operations, externalLabel: label, labelHistory: history,
        ...(shipped ? { dispatchedFrom: "inventory-app", dispatchedAt: at } : {}),
        updatedAt: at, activity: [...(operations.activity || []), { type: "event", message, createdAt: at }],
      });
      return shipped
        ? { result: "dispatched", reason: "Marked shipped on the website; the customer gets the shipped email." }
        : { result: "attached", reason: "Tracking is on the order. Mark the parcel shipped when it leaves." };
    });
  } catch (err) {
    // Not answered: the app keeps waiting and the next sweep tries again.
    return { orderId, result: "error", reason: errText(err) };
  }
  return answer(outcome.result, outcome.reason);
}

/**
 * One run: lease → heartbeat → labels from the app → catch-up pushes → past orders → stock.
 * opts.stock: "auto" (scheduled; applies when automatic stock is on and 15 min have passed),
 * "force" (Sync now), "preview" (plan only) or "apply" (owner confirmed preview `confirmHash`).
 */
const linkActive = state => salesOn(state) || Object.keys(state.links || {}).length > 0 || state.connection?.ok === true;

async function runSweep(deps, opts = {}) {
  const { db, store } = deps;
  const ref = stateRef(db);
  const start = deps.now();
  const runId = crypto.randomUUID();
  // Not set up: one plain read and nothing written (no lease, no status), so the 5-minute schedule costs ~nothing.
  const before = await ref.get();
  if (!linkActive(before.exists ? before.data() : {})) return { ran: true, inactive: true };
  const state = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    if (data.lease?.until && Date.parse(data.lease.until) > start.getTime()) return null;
    tx.set(ref, { lease: { until: iso(new Date(start.getTime() + LEASE_MS)), runId } }, { merge: true });
    return data;
  });
  if (!state) return { busy: true };
  const deadline = start.getTime() + (opts.budgetMs || 200 * 1000);
  const status = {};
  const out = { ran: true };
  try {
    const t0 = (await ref.update({ "lease.startedAt": iso(start) })).writeTime;
    if (!linkActive(state)) return { ...out, inactive: true };

    try {
      await store.heartbeat({ now: start });
      status.connection = { ...(state.connection || {}), ok: true, checkedAt: iso(start), problem: null, error: null };
    } catch (err) {
      status.connection = { ...(state.connection || {}), ok: false, checkedAt: iso(start), error: errText(err) };
      return { ...out, connection: status.connection };
    }

    // The app's own status doc: its to-do and its "Add to the app" requests (docs/INVENTORY_LINK.md › One to-do list).
    let appDoc = null;
    let appRead = false;
    try { appDoc = await store.readAppHeartbeat(); appRead = true; } catch (err) { status.pendingError = errText(err); }
    // The website's books and the app's catalog, read once per run and only when something needs them.
    let catalogLoad = null;
    const loadCatalogs = () => catalogLoad || (catalogLoad = Promise.all([db.collection("books").get(), store.readCatalog()])
      .then(([booksSnap, appBooks]) => ({ books: booksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })), appBooks })));

    // Stock is only worked out when every order that may have changed is recorded (`recorded`).
    let recorded = true;
    if (salesOn(state)) {
      const weekAgo = start.getTime() - 7 * 24 * 60 * 60 * 1000;
      let issues = (state.shipmentIssues || []).filter(i => i && Date.parse(i.at) > weekAgo);
      try {
        const waiting = await store.waitingShipments();
        out.shipments = [];
        for (const item of waiting) {
          if (deps.now().getTime() >= deadline) break;
          out.shipments.push(await applyAppShipment(deps, item));
        }
        // Labels the website refused stay listed (admin alert) until that order's label is sent again, for a week.
        const handled = new Set(out.shipments.map(s => s.orderId));
        issues = [
          ...issues.filter(i => !handled.has(i.orderId)),
          ...out.shipments.filter(s => s.result === "refused").map(s => ({ orderId: s.orderId, reason: s.reason, at: iso(start) })),
        ];
      } catch (err) { status.shipmentError = errText(err); }
      status.shipmentIssues = issues.slice(-20);

      const since = state.catchUpResumeAt
        || iso(state.lastCatchUpAt ? new Date(Date.parse(state.lastCatchUpAt) - CATCH_UP_MARGIN_MS) : new Date(start.getTime() - FIRST_CATCH_UP_MS));
      const caught = await catchUp(deps, state, since, { deadline });
      out.catchUp = { pushed: caught.pushed, undelivered: caught.undelivered, errors: caught.errors, complete: caught.complete };
      status.lastPush = { at: iso(start), failed: caught.undelivered + caught.errors };
      if (caught.complete) { status.lastCatchUpAt = iso(start); status.catchUpResumeAt = null; }
      else if (caught.resumeAt && !caught.skipped && !caught.errors) status.catchUpResumeAt = caught.resumeAt;
      recorded = caught.complete;

      if (state.relinkPending) {
        const page = await relinkBatch(deps, state, { deadline });
        status.relinkPending = !page.done;
        status.relinkCursor = page.cursor;
        out.relink = { pushed: page.pushed, done: page.done };
        if (!page.done) recorded = false;
      }

      if (state.backfill && state.backfill.done !== true) {
        const page = await backfillBatch(deps, state, { deadline });
        status.backfill = page.backfill;
        out.backfill = page.backfill;
      }
      try {
        status.pendingImport = await store.pendingSummary();
      } catch (err) { status.pendingError = errText(err); }
    }
    if (appRead) {
      status.app = appDoc ? {
        lastImportAt: appDoc.lastImportAt || null, lastFeedAt: appDoc.lastFeedAt || null, importConsentAt: appDoc.importConsentAt || null,
        todo: cleanAppTodo(appDoc.todo),
      } : null;
    }

    // "Add to the app": the owner saved a website book in the app; link the two with Match these' guards.
    const requests = appDoc && appDoc.linkRequests && typeof appDoc.linkRequests === "object" ? appDoc.linkRequests : {};
    // Not read this run: keep every answer, so nothing is tried again on a partial view.
    let replies = appRead ? keptReplies(state.appLinkReplies, start, requests) : { ...(state.appLinkReplies || {}) };
    const unanswered = Object.entries(requests).some(([key, r]) => r && replies[key]?.inventoryBookId !== r.inventoryBookId);
    if (Object.keys(state.links || {}).length && unanswered) {
      try {
        const { books, appBooks } = await loadCatalogs();
        const appIds = appBooks.map(b => b.id);
        const result = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          const fresh = snap.exists ? snap.data() : {};
          const current = fresh.links || {};
          const plan = linkRequestPlan({ requests, replies, links: current, books, appBookIds: appIds, now: start });
          if (!plan.adds.length) return { plan, links: current, saved: false };
          const next = Object.fromEntries(Object.entries(current).map(([id, entry]) => [id, { ...entry }]));
          plan.adds.forEach(a => { next[a.bookId] = { ...(next[a.bookId] || {}), [a.variantId || "_"]: a.inventoryBookId }; });
          const { links, errors } = validateLinks(books, next, appIds);
          const lost = linkedEditions(current).filter(e => links[e.bookId]?.[e.variantId || "_"] !== e.inventoryBookId);
          const refuse = (a, reason) => { plan.replies[a.key] = { ...plan.replies[a.key], result: "refused", reason }; };
          if (lost.length) {
            plan.adds.forEach(a => refuse(a, "Matching it here would change books already matched, so nothing was saved. Match it on the website's Inventory app link page."));
            return { plan, links: current, saved: false };
          }
          plan.adds.filter(a => links[a.bookId]?.[a.variantId || "_"] !== a.inventoryBookId)
            .forEach(a => refuse(a, (errors.find(e => e.bookId === a.bookId)?.reason) || "The website couldn't match this book. Match it on the website's Inventory app link page."));
          tx.update(ref, { links, linksSavedAt: iso(start), linksSavedBy: "Inventory app (Add to the app)", ...(fresh.startDay ? { relinkPending: true, relinkCursor: null } : {}) });
          return { plan, links, saved: true, relink: !!fresh.startDay };
        });
        replies = { ...replies, ...result.plan.replies };
        if (result.saved) {
          state.links = result.links;
          // New matches: orders with unmatched copies are sent again (this run's own relink status must not undo it).
          // Its past orders aren't counted yet, so stock waits for the re-send too (the rule for every new match).
          if (result.relink) { status.relinkPending = true; status.relinkCursor = null; recorded = false; }
        }
        out.linkRequests = { answered: Object.keys(result.plan.replies).length, linked: result.saved ? result.plan.adds.length : 0 };
        status.linkRequestError = null;
      } catch (err) { status.linkRequestError = errText(err); console.error("inventory link: app link requests", err); }
    }
    status.appLinkReplies = replies;

    // Books added to both shops since the matching step: suggest their match (one click in the panel).
    // Throttled on the last attempt, so a failing read isn't retried every five minutes.
    const lastMatchCheck = Date.parse(state.matchCheckedAt || state.newMatches?.at || "");
    // A detail copied in the admin since the last check (detailsChangedAt) brings it forward, so the app sees the new
    // value soon. A copy made while this run works is newer than this run's check time, so the next run picks it up.
    const detailsChanged = Date.parse(state.detailsChangedAt || "") > (Number.isFinite(lastMatchCheck) ? lastMatchCheck : -Infinity);
    if (Object.keys(state.links || {}).length && (detailsChanged || !Number.isFinite(lastMatchCheck) || start.getTime() - lastMatchCheck >= MATCH_EVERY_MS - 60 * 1000)) {
      status.matchCheckedAt = iso(start);
      try {
        const { books, appBooks } = await loadCatalogs();
        const ignoredMatches = state.ignoredMatches || {};
        const items = newMatchList(books, appBooks, state.links, ignoredMatches);
        status.newMatches = { at: iso(start), count: items.length, items: items.slice(0, 50) };
        status.matchError = null;
        // Books in only one of the two: the app's books for "Add to the shop" here, the website's for "Add to the app".
        status.appOnlyBooks = { at: iso(start), items: appBooksForShop(books, appBooks, state.links, { ignoredMatches, ignoredAppBooks: state.ignoredAppBooks || {} }) };
        // Without the app's doc its dismissed books are unknown: keep the list it has rather than bring them back.
        // Details the two apps disagree on, and the app's books for the admin search.
        const linked = linkedForApp(books, state.links);
        status.detailDiffs = { at: iso(start), items: detailDifferences(linked, appBooks, state.keptDetails || {}) };
        status.appBookIndex = { at: iso(start), items: appBookIndex(appBooks) };
        if (appRead) try {
          await store.writeShopCatalog({ at: iso(start), linked, books: shopBooksForApp(books, appBooks, state.links, { ignoredMatches, dismissed: appDoc?.dismissedShopBooks || {}, now: start.getTime() }) });
          status.shopCatalogError = null;
        } catch (err) { status.shopCatalogError = errText(err); console.error("inventory link: shop catalog", err); }
      } catch (err) { status.matchError = errText(err); }
    } else if (!Object.keys(state.links || {}).length && (state.newMatches || state.appOnlyBooks)) {
      status.newMatches = null;
      status.appOnlyBooks = null;
      status.detailDiffs = null;
    }

    const backfillDone = (status.backfill || state.backfill)?.done === true;
    const stockReady = salesOn(state) && backfillDone;
    const mode = opts.stock || "auto";
    const due = mode === "force" || (mode === "auto" && state.autoSync === true && (!state.lastStockAt || start.getTime() - Date.parse(state.lastStockAt) >= STOCK_EVERY_MS - 60 * 1000));
    if (["preview", "apply"].includes(mode) || (due && stockReady)) {
      if (!stockReady) {
        out.stock = { notReady: true };
      } else if (!recorded) {
        // Some recent website sales aren't recorded yet: their copies would be put back on sale. Next run.
        out.stock = { catchingUp: true };
      } else {
        const plan = await planStock(deps, state);
        out.stock = { hash: plan.hash, rows: plan.rows };
        if (mode === "apply" && plan.hash !== opts.confirmHash) {
          out.stock.changed = true; // numbers moved since the preview: show the new preview, write nothing
        } else if (mode !== "preview") {
          const applied = await applyStock(deps, plan.rows, { t0, mode: mode === "apply" ? "confirmed" : "auto", by: opts.by || "Inventory app link" });
          out.stock.applied = applied;
          status.lastStockAt = iso(start);
          status.lastSync = {
            at: iso(start), mode: mode === "apply" ? "confirmed" : mode,
            changes: applied.filter(r => r.result === "applied").slice(0, 100),
            skipped: applied.filter(r => r.result !== "applied").slice(0, 100),
            holds: plan.rows.filter(r => r.hold && !(mode === "apply" && CONFIRMED_HOLDS.has(r.hold))).map(r => ({
              bookId: r.bookId, variantId: r.variantId, title: r.title, edition: r.edition, from: r.from, to: r.to, hold: r.hold,
            })).slice(0, 100),
            appAhead: plan.rows.filter(r => r.appAhead).map(r => ({ bookId: r.bookId, variantId: r.variantId, title: r.title })).slice(0, 50),
          };
          if (mode === "apply" && !state.firstApplyAt) status.firstApplyAt = iso(start);
        }
      }
    }

    // What waits on the website, for the app's To-do list, and the answers to its requests. Written when it changes.
    try {
      const links = state.links || {};
      const used = new Set(Object.values(links).flatMap(e => Object.values(e || {})));
      const ignoredApp = state.ignoredAppBooks || {};
      const matches = status.newMatches !== undefined ? status.newMatches : state.newMatches;
      const appOnly = status.appOnlyBooks !== undefined ? status.appOnlyBooks : state.appOnlyBooks;
      const todo = websiteTodo({
        // The same holds the website's own alert names: automatic stock is on and the change needs the owner.
        holds: state.autoSync ? ((status.lastSync || state.lastSync)?.holds || []).filter(h => OWNER_HOLDS.has(h && h.hold)) : [],
        newMatches: matches ? openMatches(matches.items, links, state.ignoredMatches || {}).length : 0,
        appOnly: (appOnly?.items || []).filter(b => !used.has(b.id) && !ignoredApp[b.id]).length,
        adminUrl: deps.adminUrl || "https://lmb-test-shop.web.app/admin",
        now: start,
      });
      const signature = stable({ items: todo.items, replies });
      if (signature !== state.websiteSideSig) {
        await store.writeWebsiteSide({ todo, linkReplies: replies });
        status.websiteSideSig = signature;
      }
      status.websiteSideError = null;
    } catch (err) { status.websiteSideError = errText(err); console.error("inventory link: website to-do", err); }
    return out;
  } catch (err) {
    status.lastError = { at: iso(deps.now()), message: errText(err) };
    out.error = errText(err);
    return out;
  } finally {
    status.lastRunAt = iso(start);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const lease = snap.exists ? snap.data().lease : null;
      // Matches or "Not these" saved while this run worked win over the suggestions it worked out.
      if (status.newMatches) {
        const fresh = snap.exists ? snap.data() : {};
        const items = openMatches(status.newMatches.items, fresh.links || {}, fresh.ignoredMatches || {});
        status.newMatches = { ...status.newMatches, items, count: Math.max(0, status.newMatches.count - (status.newMatches.items.length - items.length)) };
      }
      // The admin re-checked or copied a detail while this run worked: its list is newer than this run's.
      const fresh = snap.exists ? snap.data() : {};
      if (status.detailDiffs && Date.parse(fresh.detailDiffs?.at || "") > start.getTime()) { delete status.detailDiffs; delete status.appBookIndex; }
      tx.set(ref, { ...status, ...(lease?.runId === runId ? { lease: FieldValue.delete() } : {}) }, { merge: true });
      // A merge keeps map keys the run dropped, so pruned answers are replaced as a whole field.
      if (status.appLinkReplies !== undefined) tx.update(ref, { appLinkReplies: status.appLinkReplies });
    }).catch(err => console.error("inventory link: could not save the run's status", err));
  }
}

module.exports = {
  LEASE_MS, REHEARSAL_MS, MATCH_EVERY_MS, STATE_DOC, readState, pushOrder, catchUp, relinkBatch, backfillBatch, planStock, applyStock,
  applyAppShipment, runSweep, rehearsalOn, salesOn,
};
