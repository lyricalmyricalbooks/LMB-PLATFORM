// Inventory › Inventory app link (admin): what each button asks the server to do. index.js checks the
// admin's sign-in (requireAdmin) and passes `deps` (see inventoryLinkJobs.js) plus the store's
// checkConnection/readCatalog/serviceAccountEmail. Returns { status, body } for the HTTP answer.
const {
  validateLinks, paidDayOf, linkedEditions, openMatches, linkableEditions, stable, linkedForApp, detailDifferences, detailSignature,
  detailPatch, detailValue, appBookIndex,
} = require("./inventoryLink");
const { readState, runSweep, REHEARSAL_MS, STATE_DOC } = require("./inventoryLinkJobs");
const { shopDate } = require("./paymentGuards");
const { saleActive } = require("./shared/promotions");

const ok = body => ({ status: 200, body });
const bad = (error, status = 400) => ({ status, body: { error } });
const PUBLIC_STATE_KEYS = ["links", "startDay", "autoSync", "rehearsalUntil", "firstApplyAt", "backfill", "connection",
  "lastSync", "lastStockAt", "lastRunAt", "lastPush", "pendingImport", "app", "lastError", "relinkPending", "shipmentError", "pendingError", "shipmentIssues", "newMatches", "ignoredMatches",
  "appOnlyBooks", "ignoredAppBooks", "linkRequestError", "shopCatalogError", "websiteSideError", "detailDiffs", "keptDetails", "appBookIndex"];

async function counts(db) {
  const count = async query => { try { return (await query.count().get()).data().count; } catch { return null; } };
  const [undelivered, unlinked] = await Promise.all([
    count(db.collection("inventoryPushes").where("delivered", "==", false)),
    count(db.collection("inventoryPushes").where("unlinkedCount", ">", 0)),
  ]);
  return { undelivered, unlinkedOrders: unlinked };
}

/** The first day a real order was paid (the default start for "Send past orders"). */
async function earliestPaidDay(db) {
  const snap = await db.collection("orders").orderBy("paidAt").limit(25).get();
  const first = snap.docs.map(doc => doc.data()).find(order => order.isTest !== true && order.paymentStatus && order.paymentStatus !== "unpaid");
  return first ? paidDayOf(first) || null : null;
}

// newMatches with only the suggestions still worth offering under these links (none without links).
const trimmedMatches = (state, links, ignored = state.ignoredMatches || {}) => {
  if (!state.newMatches) return null;
  const before = Array.isArray(state.newMatches.items) ? state.newMatches.items : [];
  const items = openMatches(before, links, ignored);
  const count = Object.keys(links || {}).length ? Math.max(0, (state.newMatches.count || 0) - (before.length - items.length)) : 0;
  return { ...state.newMatches, items, count };
};

async function inventoryLinkAdmin(deps, body = {}, actor = "admin") {
  const { db, store } = deps;
  const ref = db.collection(STATE_DOC[0]).doc(STATE_DOC[1]);
  const now = deps.now();
  const op = String(body.op || "");

  if (op === "status") {
    const [state, extra, earliest, serviceAccount] = await Promise.all([
      readState(db), counts(db), earliestPaidDay(db).catch(() => null), store.serviceAccountEmail(),
    ]);
    const visible = Object.fromEntries(PUBLIC_STATE_KEYS.filter(key => state[key] !== undefined).map(key => [key, state[key]]));
    return ok({ state: visible, ...extra, earliestPaidDay: earliest, serviceAccount, busy: !!(state.lease?.until && Date.parse(state.lease.until) > now.getTime()), today: shopDate(now) });
  }

  if (op === "check") {
    const result = await store.checkConnection({ now });
    const connection = { ok: result.ok, serviceAccount: result.serviceAccount || "", problem: result.problem || null, error: result.error || null, checkedAt: now.toISOString() };
    await ref.set({ connection }, { merge: true });
    return ok({ connection });
  }

  if (op === "catalog") {
    try {
      return ok({ books: await store.readCatalog() });
    } catch (err) {
      return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
    }
  }

  if (op === "saveLinks") {
    if (!body.links || typeof body.links !== "object" || Array.isArray(body.links)) return bad("Send the links to save.");
    const state = await readState(db);
    // Only taking matches away needs no answer from the inventory app, so the owner can always undo the
    // link (for instance when the connection is broken) and edit those books' stock on the website again.
    const removalsOnly = linkedEditions(body.links).every(e => state.links?.[e.bookId]?.[e.variantId || "_"] === e.inventoryBookId);
    let inventoryIds = null;
    if (!removalsOnly) {
      try {
        inventoryIds = (await store.readCatalog()).map(book => book.id);
      } catch {
        return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
      }
    }
    const booksSnap = await db.collection("books").get();
    const books = booksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { links, errors } = validateLinks(books, body.links, inventoryIds);
    // New matches: orders with unmatched copies are sent again from the start (relinkBatch pages through all).
    const relink = !!state.startDay && !removalsOnly;
    // Suggestions for editions (or inventory app books) matched now are done with; unmatching all clears them.
    const newMatches = trimmedMatches(state, links);
    const patch = { links, linksSavedAt: now.toISOString(), linksSavedBy: actor, ...(relink ? { relinkPending: true, relinkCursor: null } : {}), ...(newMatches ? { newMatches } : {}) };
    // In one transaction with a check that nobody (the sweep's "Add to the app", another tab) changed the matches
    // since this save read them; `links` is written whole so a removed link is gone.
    const moved = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const fresh = snap.exists ? snap.data() : {};
      if (stable(fresh.links || {}) !== stable(state.links || {})) return true;
      if (snap.exists) tx.update(ref, patch); else tx.set(ref, patch, { merge: true });
      return false;
    });
    if (moved) return bad("The matches changed while you were saving (a book was matched from the inventory app). Reload the page and save again.", 409);
    return ok({ links, errors });
  }

  // "Match these": adds the chosen stored suggestions to the links as they are now (read fresh), never
  // replacing a match: an edition already matched, or an inventory app book already in use, is skipped.
  if (op === "acceptMatches") {
    const keys = new Set((Array.isArray(body.keys) ? body.keys : []).filter(k => typeof k === "string" && k.length <= 300).slice(0, 50));
    if (!keys.size) return bad("Choose the matches to save.");
    const state = await readState(db);
    const current = state.links || {};
    const chosen = openMatches(state.newMatches?.items, current).filter(m => keys.has(m.key));
    if (!chosen.length) return bad("These suggestions are out of date. Reload the page to see the current ones.", 409);
    let inventoryIds;
    try {
      inventoryIds = (await store.readCatalog()).map(book => book.id);
    } catch {
      return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
    }
    const next = Object.fromEntries(Object.entries(current).map(([id, entry]) => [id, { ...entry }]));
    for (const m of chosen) next[m.bookId] = { ...(next[m.bookId] || {}), [m.variantId || "_"]: m.inventoryBookId };
    const booksSnap = await db.collection("books").get();
    const books = booksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { links, errors } = validateLinks(books, next, inventoryIds);
    // Never lose a match that was already there.
    const lost = linkedEditions(current).filter(e => links[e.bookId]?.[e.variantId || "_"] !== e.inventoryBookId);
    if (lost.length) return bad("These matches would change books already matched, so nothing was saved. Match them in the list below instead.", 409);
    const newMatches = trimmedMatches(state, links);
    const patch = { links, linksSavedAt: now.toISOString(), linksSavedBy: actor, ...(state.startDay ? { relinkPending: true, relinkCursor: null } : {}), ...(newMatches ? { newMatches } : {}) };
    await ref.update(patch).catch(async () => { await ref.set(patch, { merge: true }); });
    const added = chosen.filter(m => links[m.bookId]?.[m.variantId || "_"] === m.inventoryBookId).length;
    return ok({ links, errors, added });
  }

  // "Add to the shop": the owner saved a new website book made from an app book; match the two. Same guards as
  // Match these — the edition is printed and unmatched, the app book exists and isn't matched — and no match moves.
  if (op === "linkNewBook") {
    const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
    const variantId = typeof body.variantId === "string" && body.variantId.trim() ? body.variantId.trim() : null;
    const inventoryBookId = typeof body.inventoryBookId === "string" ? body.inventoryBookId.trim() : "";
    if (!bookId || !inventoryBookId || bookId.length > 200 || inventoryBookId.length > 200) return bad("Choose the book to match.");
    let inventoryIds;
    try {
      inventoryIds = (await store.readCatalog()).map(book => book.id);
    } catch {
      return bad("The website can't read the inventory app right now. The book is saved; match it below once the connection is back.", 409);
    }
    if (!inventoryIds.includes(inventoryBookId)) return bad("That book isn't in the inventory app any more.", 409);
    const bookSnap = await db.collection("books").doc(bookId).get();
    if (!bookSnap.exists) return bad("That website book wasn't found.", 404);
    const book = { id: bookSnap.id, ...bookSnap.data() };
    const edition = linkableEditions([book]).find(e => (e.variantId || null) === variantId);
    if (!edition) return bad("Only printed books can be matched to the inventory app.");
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const state = snap.exists ? snap.data() : {};
      const current = state.links || {};
      const used = new Set(Object.values(current).flatMap(e => Object.values(e || {})));
      const existing = current[bookId]?.[variantId || "_"];
      if (existing === inventoryBookId) return { links: current, already: true };
      if (existing) return { error: "This website book is already matched to another book in the app." };
      if (used.has(inventoryBookId)) return { error: "That book in the app is already matched to another website book." };
      const links = { ...current, [bookId]: { ...(current[bookId] || {}), [variantId || "_"]: inventoryBookId } };
      const items = (state.appOnlyBooks?.items || []).filter(b => b.id !== inventoryBookId);
      tx.update(ref, {
        links, linksSavedAt: now.toISOString(), linksSavedBy: actor,
        ...(state.startDay ? { relinkPending: true, relinkCursor: null } : {}),
        ...(state.appOnlyBooks ? { appOnlyBooks: { ...state.appOnlyBooks, items } } : {}),
      });
      return { links };
    });
    if (result.error) return bad(result.error, 409);
    return ok({ links: result.links, already: !!result.already });
  }

  // Book details in step: re-check now, copy the app's value onto the website book, or leave one as is.
  if (op === "checkDetails" || op === "applyDetail") {
    let books;
    let appBooks;
    try {
      [books, appBooks] = await Promise.all([
        db.collection("books").get().then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
        store.readCatalog(),
      ]);
    } catch {
      return bad("The website can't read the inventory app right now. Try again in a few minutes.", 409);
    }
    const state = await readState(db);
    const at = now.toISOString();
    const items = detailDifferences(linkedForApp(books, state.links || {}), appBooks, state.keptDetails || {});
    const save = async list => {
      const patch = { detailDiffs: { at, items: list }, appBookIndex: { at, items: appBookIndex(appBooks) } };
      await ref.update(patch).catch(async () => { await ref.set(patch, { merge: true }); });
    };
    if (op === "checkDetails") {
      await save(items);
      return ok({ detailDiffs: { at, items } });
    }
    const diff = items.find(d => d.id === body.id);
    if (!diff || detailSignature(diff) !== body.signature) {
      await save(items);
      return bad("This changed in one of the apps since the list was made. The list is up to date now: check it again.", 409);
    }
    if (!diff.app) return bad("The inventory app has nothing to copy for this.");
    const bookRef = db.collection("books").doc(diff.bookId);
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(bookRef);
      if (!snap.exists) return { error: "That website book wasn't found." };
      const book = { id: snap.id, ...snap.data() };
      // Still the value the owner saw? (a save in the book editor meanwhile wins)
      const fresh = linkedForApp([book], { [book.id]: (state.links || {})[book.id] }).find(r => r.inventoryBookId === diff.inventoryBookId);
      if (!fresh || detailValue(diff.field, fresh[diff.field]) !== diff.shop) return { error: "This book was changed on the website meanwhile. Check the list again." };
      // A book on sale is charged its sale price, so a new regular price alone wouldn't change what shoppers pay.
      if (diff.field === "price" && !diff.variantId && saleActive(book, now)) {
        return { error: "This book is on sale, so shoppers pay the sale price. Change its prices in the book editor." };
      }
      const patch = detailPatch(book, diff);
      if (!patch) return { error: "This detail can't be copied onto the website book." };
      tx.update(bookRef, { ...patch, updatedAt: at });
      return { patch };
    });
    if (result.error) return bad(result.error, 409);
    const rest = items.filter(d => d.id !== diff.id);
    await save(rest);
    // The app sees the new value at the next sweep instead of in an hour.
    await ref.update({ detailsChangedAt: at }).catch(() => {});
    return ok({ applied: diff, detailDiffs: { at, items: rest } });
  }

  if (op === "keepDetail") {
    const id = typeof body.id === "string" ? body.id : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!id || id.length > 300 || !signature || signature.length > 1000) return bad("Choose the detail.");
    const state = await readState(db);
    // Kept until either value changes (the signature then no longer matches); capped so the record stays small.
    const keptDetails = Object.fromEntries([...Object.entries(state.keptDetails || {}).filter(([key]) => key !== id), [id, signature]].slice(-1000));
    await ref.update({ keptDetails }).catch(async () => { await ref.set({ keptDetails }, { merge: true }); });
    return ok({ keptDetails });
  }

  // "Not for the shop" (or bring one back): the app book stops being offered under Add to the shop.
  if (op === "ignoreAppBooks" || op === "unignoreAppBooks") {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(id => typeof id === "string" && id && id.length <= 200).slice(0, 100);
    if (!ids.length) return bad("Choose the books.");
    const state = await readState(db);
    const ignoredAppBooks = { ...(state.ignoredAppBooks || {}) };
    ids.forEach(id => { if (op === "ignoreAppBooks") ignoredAppBooks[id] = now.toISOString(); else delete ignoredAppBooks[id]; });
    await ref.update({ ignoredAppBooks }).catch(async () => { await ref.set({ ignoredAppBooks }, { merge: true }); });
    return ok({ ignoredAppBooks });
  }

  // "Not these": the sweep stops suggesting these pairs (a different later suggestion still shows).
  if (op === "ignoreMatches") {
    const list = Array.isArray(body.matches) ? body.matches.slice(0, 50) : [];
    const pairs = list.filter(m => m && typeof m.key === "string" && m.key.length <= 300 && typeof m.inventoryBookId === "string" && m.inventoryBookId && m.inventoryBookId.length <= 200);
    if (!pairs.length) return bad("Choose the matches to leave out.");
    const state = await readState(db);
    const ignoredMatches = { ...(state.ignoredMatches || {}) };
    pairs.forEach(m => { ignoredMatches[m.key] = m.inventoryBookId; });
    const newMatches = trimmedMatches(state, state.links || {}, ignoredMatches);
    await ref.update({ ignoredMatches, ...(newMatches ? { newMatches } : {}) }).catch(async () => { await ref.set({ ignoredMatches, ...(newMatches ? { newMatches } : {}) }, { merge: true }); });
    return ok({ ignoredMatches, newMatches });
  }

  if (op === "setOptions") {
    const patch = {};
    if (typeof body.autoSync === "boolean") {
      const state = await readState(db);
      if (body.autoSync && !state.firstApplyAt) return bad("Preview and apply the stock numbers once before turning on automatic stock.", 409);
      patch.autoSync = body.autoSync;
    }
    if (typeof body.rehearsal === "boolean") patch.rehearsalUntil = body.rehearsal ? new Date(now.getTime() + REHEARSAL_MS).toISOString() : null;
    if (!Object.keys(patch).length) return bad("Nothing to change.");
    await ref.set(patch, { merge: true });
    return ok({ saved: patch });
  }

  if (op === "startSales") {
    const day = String(body.startDay || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return bad("Choose the first day to send.");
    if (day > shopDate(now)) return bad("The first day can't be in the future.");
    const current = await readState(db);
    if (current.startDay) {
      // Moving the start day earlier sends the older orders too. A later day would mean taking back
      // orders the inventory app already has, so it is refused.
      if (day >= current.startDay) {
        return bad(`Website sales are already sent from ${current.startDay}. Choose an earlier day to send older orders too; a later day isn't possible because orders already sent can't be taken back.`, 409);
      }
      if (current.connection?.ok !== true) return bad("Check the connection to the inventory app first.", 409);
      // The inventory app hears first that older orders are on their way (informational).
      try {
        await store.markPastOrders({ from: day, at: now.toISOString() });
      } catch {
        return bad("The inventory app couldn't be told about the older orders, so nothing changed. Check the connection and try again.", 409);
      }
      const moved = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const state = snap.exists ? snap.data() : {};
        if (state.startDay !== current.startDay) return false;
        tx.set(ref, {
          startDay: day, backfill: { from: day, done: false, cursor: null, sent: 0 },
          startDayChangedAt: now.toISOString(), startDayChangedBy: actor, startDayChangedFrom: current.startDay,
        }, { merge: true });
        return true;
      });
      if (!moved) return bad("The start date was changed somewhere else a moment ago. Reload and try again.", 409);
      const run = await runSweep(deps, { stock: "none", budgetMs: 40 * 1000 });
      return ok({ startDay: day, changedFrom: current.startDay, run: summary(run) });
    }
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const state = snap.exists ? snap.data() : {};
      if (state.startDay) return state.startDay;
      if (state.connection?.ok !== true) return false;
      tx.set(ref, { startDay: day, backfill: { from: day, done: false, cursor: null, sent: 0 }, salesStartedAt: now.toISOString(), salesStartedBy: actor }, { merge: true });
      return true;
    });
    if (result === false) return bad("Check the connection to the inventory app first.", 409);
    if (result !== true) return bad(`Website sales are already being sent from ${result}. Reload the page to see it.`, 409);
    const run = await runSweep(deps, { stock: "none", budgetMs: 40 * 1000 });
    return ok({ startDay: day, run: summary(run) });
  }

  if (["preview", "apply", "syncNow"].includes(op)) {
    if (op === "apply" && typeof body.confirmHash !== "string") return bad("Preview the numbers first.");
    const run = await runSweep(deps, {
      stock: op === "preview" ? "preview" : op === "apply" ? "apply" : "force",
      confirmHash: body.confirmHash, by: actor, budgetMs: 40 * 1000,
    });
    if (run.busy) return bad("The link is busy with its regular check. Try again in a minute.", 409);
    return ok({ run: summary(run), stock: run.stock || null });
  }

  return bad("Unknown inventory link action.");
}

function summary(run) {
  if (!run) return null;
  const { stock, ...rest } = run;
  return rest;
}

module.exports = { inventoryLinkAdmin, earliestPaidDay };
