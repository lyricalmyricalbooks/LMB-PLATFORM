// Scheduled jobs: the daily "orders needing you" email, the weekly summary, abandoned bag reminders (and old bag
// cleanup), the stale product photo sweep and the back-in-stock catch-up sweep. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own Firebase wrappers, db and email
// helpers, so the vm-based handler tests' fakes still apply, and keeps each `exports.<name> =` line.

function scheduledJobs({
  onSchedule, admin, db, crypto, ADMIN_TO, RESEND_API_KEY, DIGEST_ORDER_LIMIT, RESTOCK_BUDGET_MS, TRANSIT_DAYS,
  buildOrderDigest, catalogUnitPrice, claimEmailSend, compileEmailTemplate, dailyDigestEnabled,
  digestNeedsOperations, digestSince, escapeHtml, footerAddress, loadNotificationSettings,
  marketingUnsubscribeKey, moneyFmt, nextDailyCount, normMarketingEmail, optOutId, pruneOldCarts,
  reminderFirstName, runInBatches, sendEmail, sendRestockAlerts, sendWeeklySummary, siteLink,
  stockOf, unsubscribeToken, weeklySummaryEnabled,
}) {
  // ──────────────────────────────────────────────────────────────
  // 7. Abandoned cart sweep: every hour, recover carts older than 1h
  // ──────────────────────────────────────────────────────────────
  // Daily 8am (Toronto) email to the publisher listing paid parcels not shipped after
  // 3 days, parcels in transit 14+ days and label purchases that need checking in
  // Shippo. Nothing is sent on days with nothing to report.
  const dailyOrderDigest = onSchedule(
    { schedule: "every day 08:00", timeZone: "America/Toronto", secrets: [RESEND_API_KEY] },
    async () => {
      // Settings › Notifications › Shop alerts › Daily "orders needing you" email.
      const notificationDoc = await db.collection("settings").doc("notifications").get().catch(() => null);
      if (!dailyDigestEnabled(notificationDoc?.data?.() || {})) return;
      // Bounded: paid orders of the last DIGEST_WINDOW_DAYS (newest first, at most DIGEST_ORDER_LIMIT), and the private
      // record only for orders that are still open, so reads no longer grow with every order the shop has ever taken.
      const paidSnap = await db.collection("orders").where("paymentStatus", "==", "paid")
        .where("createdAt", ">=", digestSince()).orderBy("createdAt", "desc").limit(DIGEST_ORDER_LIMIT).get();
      const orders = paidSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const ops = new Map();
      const openIds = orders.filter(digestNeedsOperations).map(o => o.id);
      for (let i = 0; i < openIds.length; i += 300) {
        const refs = openIds.slice(i, i + 300).map(id => db.collection("order-operations").doc(id));
        for (const snap of await db.getAll(...refs)) if (snap.exists) ops.set(snap.id, snap.data());
      }
      const digest = buildOrderDigest(orders, ops);
      if (!digest.total) return;
      const link = id => siteLink(`/admin#orders/${encodeURIComponent(id)}`);
      const rows = (items, describe) => items.map(item => `<li style="margin:6px 0;"><a href="${link(item.id)}">${escapeHtml(item.label)}</a> — ${escapeHtml(describe(item))}</li>`).join("");
      const section = (title, items, describe) => items.length ? `<h3 style="margin:24px 0 8px;">${title} (${items.length})</h3><ul style="padding-left:18px;">${rows(items, describe)}</ul>` : "";
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;">Orders needing you today</h2>
          ${section("Paid, not shipped yet", digest.unshipped, o => `${o.days} days since payment${o.customer ? ` · ${o.customer}` : ""}`)}
          ${section(`In transit ${TRANSIT_DAYS}+ days`, digest.stuck, o => `${o.days} days · ${[o.carrier, o.tracking].filter(Boolean).join(" ")} — check tracking or open a claim`)}
          ${section("Label purchase to check in Shippo", digest.labelChecks, () => "a label purchase didn't finish; check Shippo before buying again")}
          <p style="margin-top:24px;"><a href="${siteLink("/admin#orders")}">Open Orders &rarr;</a></p>
        </div>`;
      try {
        await sendEmail({
          to: ADMIN_TO,
          subject: `[TO DO] ${digest.total} order${digest.total === 1 ? "" : "s"} need attention`,
          html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Daily order digest failed", err);
      }
    }
  );

  // The Monday summary email: last week's sales and visits against the week before (functions/weeklySummary.js).
  // Reads every paid order once a week (only the fields it needs) so "new customers" means first-ever orders.
  const weeklySummary = onSchedule(
    { schedule: "every monday 08:00", timeZone: "America/Toronto", timeoutSeconds: 120, secrets: [RESEND_API_KEY] },
    async () => {
      const notificationDoc = await db.collection("settings").doc("notifications").get().catch(() => null);
      if (!weeklySummaryEnabled(notificationDoc?.data?.() || {})) return;
      await sendWeeklySummary();
    }
  );

  const ABANDONED_CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  const ABANDONED_CART_MAX_ITEMS = 20;

  const ABANDONED_CART_BATCH = 500;

  const abandonedCartSweep = onSchedule(
    { schedule: "every 60 minutes", timeoutSeconds: 300, secrets: [RESEND_API_KEY] },
    async () => {
      const sweepDeadline = Date.now() + 240 * 1000;
      // Carts nobody can still be reminded about are deleted, so this collection (and every later sweep)
      // stays small however many carts visitors have written. Own try/catch: never blocks the reminders.
      try { await pruneOldCarts(db); } catch (err) { console.warn("abandonedCartSweep: cart cleanup failed:", err.message); }
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      // Only the 7-day window a reminder can still be sent in, newest first, at most ABANDONED_CART_BATCH per run
      // (the same index as before: recovered + updatedAt). Older carts are not read at all.
      const oldestUpdated = new Date(Date.now() - ABANDONED_CART_MAX_AGE_MS).toISOString();
      const snap = await db
        .collection("abandoned-carts")
        .where("recovered", "==", false)
        .where("updatedAt", ">=", oldestUpdated)
        .where("updatedAt", "<", cutoff)
        .orderBy("updatedAt", "desc")
        .limit(ABANDONED_CART_BATCH)
        .get();

      // Cart docs are written by anonymous browsers, so nothing in them is trusted
      // for the email: items/prices are rebuilt from the catalog, text is escaped,
      // stale or forged timestamps are skipped and each address is throttled.
      const oldest = new Date(Date.now() - ABANDONED_CART_MAX_AGE_MS).toISOString();
      const pending = snap.docs.filter(doc => doc.data().notified !== true && String(doc.data().updatedAt || "") >= oldest);
      // Settings are read only when a cart is waiting (most hourly runs find none).
      if (!pending.length) return;
      const notificationSettings = await loadNotificationSettings();
      // Settings › Notifications › Abandoned Cart can switch these reminders off.
      if (notificationSettings.abandoned_cart?.enabled === false) return;
      // Marketing email must carry the shop's postal address (Settings › General › Location);
      // without one the footer would leave it out, so no reminders go until it is saved.
      const websiteForAddress = (await db.collection("settings").doc("website").get().catch(() => null))?.data?.() || {};
      if (!footerAddress(websiteForAddress.location)) {
        console.warn("Abandoned-cart reminders skipped: no postal address saved in Settings › General › Location");
        return;
      }
      const unsubscribeKey = await marketingUnsubscribeKey();
      const bookCache = new Map();
      const loadBook = async id => {
        if (!bookCache.has(id)) bookCache.set(id, db.collection("books").doc(id).get().then(d => (d.exists ? d.data() : null)).catch(() => null));
        return bookCache.get(id);
      };
      const emailedThisRun = new Set();

      await runInBatches(pending, 10, async (doc) => {
        const c = doc.data();
        const email = String(c.email || "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        // Someone who unsubscribed never gets another reminder.
        if ((await db.collection("marketing-optout").doc(optOutId(email)).get()).exists) return;
        // Guests who only typed their email at checkout are reminded too (owner's choice, 14 October 2026).
        // A cart naming a stranger is still bounded: one reminder per address ever, the 25-a-day cap, the
        // shop-wide email budget, no visitor text in the email and an unsubscribe link.

        const lines = [];
        for (const item of (Array.isArray(c.items) ? c.items : []).slice(0, ABANDONED_CART_MAX_ITEMS)) {
          if (!item || typeof item.id !== "string" || !item.id || item.id.includes("/")) continue;
          const book = await loadBook(item.id);
          if (!book) continue;
          const variant = item.variantId ? (book.variants || []).find(v => v.id === item.variantId) : null;
          if (item.variantId && !variant) continue;
          const price = catalogUnitPrice(book, variant);
          if (!Number.isFinite(price) || price < 0) continue;
          const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty || item.quantity) || 1)));
          lines.push({ title: `${book.title || ""}${variant?.name ? ` (${variant.name})` : ""}`, qty, price });
        }
        if (!lines.length || emailedThisRun.has(email)) return;
        emailedThisRun.add(email);

        // One reminder per address, ever (owner's request, 14 October 2026), however many carts it leaves.
        // The record keeps no expiresAt, so the collection's TTL never frees the address for another one;
        // older records written with a 30-day expiry lose it the next time they stop a reminder.
        const throttleRef = db.collection("abandoned-cart-throttle").doc(crypto.createHash("sha256").update(email).digest("hex"));
        let previousThrottle = null;
        const throttled = await db.runTransaction(async tx => {
          const t = await tx.get(throttleRef);
          if (t.exists && t.data().lastSentAt) {
            if (t.data().expiresAt) tx.set(throttleRef, { lastSentAt: t.data().lastSentAt });
            return true;
          }
          previousThrottle = t.exists ? t.data() : null;
          tx.set(throttleRef, { lastSentAt: new Date().toISOString() });
          return false;
        }).catch(() => true);
        if (throttled) {
          await doc.ref.update({ notified: true, notifiedAt: new Date().toISOString(), notifySkipped: "throttled" }).catch(() => {});
          return;
        }
        // Shop-wide daily cap: forged carts can't make the shop a bulk sender. Over the cap, this
        // cart stays un-notified (and the address unthrottled) so tomorrow's sweep can still send it.
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const dailyRef = db.collection("abandoned-cart-throttle").doc("_daily");
        const underCap = await db.runTransaction(async tx => {
          const d = await tx.get(dailyRef);
          const next = nextDailyCount(d.exists ? d.data() : null, day);
          if (!next) return false;
          tx.set(dailyRef, next);
          return true;
        }).catch(() => false);
        // The shop-wide hourly/daily budget for anonymous-triggered email also applies.
        if (!underCap || !(await claimEmailSend(db, "abandonedCart", "", { failOpen: false }))) {
          await (previousThrottle ? throttleRef.set(previousThrottle) : throttleRef.delete()).catch(() => {});
          return;
        }

        const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
        const itemsTable = `
          <div style="margin: 20px 0; border-top: 1px solid #eee; padding-top: 15px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              ${lines.map(line => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 0;">${escapeHtml(line.title)} (x${line.qty})</td>
                  <td style="padding: 8px 0; text-align: right; font-family: monospace;">${moneyFmt(line.price * line.qty)}</td>
                </tr>`).join("")}
              <tr style="font-weight: bold;">
                <td style="padding: 12px 0;">Total</td>
                <td style="padding: 12px 0; text-align: right; font-family: monospace;">${moneyFmt(subtotal)}</td>
              </tr>
            </table>
          </div>
        `;

        const cartUrl = siteLink(`/checkout?cartId=${doc.id}`);
        const unsubscribeUrl = siteLink(`/track?unsubscribe=1&e=${encodeURIComponent(normMarketingEmail(email))}&t=${unsubscribeToken(email, unsubscribeKey)}`);
        const compiled = compileEmailTemplate("abandoned_cart", notificationSettings, {
          // Only a plain first name from the (visitor-written) cart; never their free text.
          customer_name: reminderFirstName(c.customer?.name || c.name),
          cart_url: cartUrl,
          button_url: cartUrl,
          items_table: itemsTable
        }, `<p style="margin-top:28px;font-size:11px;color:#888;">Don't want reminders like this? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.</p>`);

        try {
          await sendEmail({
            to: email,
            subject: compiled.subject,
            html: compiled.html,
            secret: RESEND_API_KEY.value(),
          });
          await doc.ref.update({ notified: true, notifiedAt: new Date().toISOString() });
        } catch (err) {
          // Release the claim so a failed send doesn't block this address's reminder.
          await (previousThrottle ? throttleRef.set(previousThrottle) : throttleRef.delete()).catch(() => {});
          console.error("Abandoned cart email failed", err);
        }
      }, { deadline: sweepDeadline });
    },
  );

  // Storage bandwidth (October 2026): book photos still served only as their original get resized WebP copies
  // (srcset), and pictures/videos get a year-long Cache-Control header (functions/imageCopies.js). Additive:
  // no file is deleted or overwritten. Once everything is done a run reads the status doc and recent books only.
  // Hourly: new uploads make their own copies, so this only catches older photos, and each run starts a 1 GiB machine.
  const storageImageSweep = onSchedule(
    { schedule: "every 60 minutes", timeoutSeconds: 300, memory: "1GiB" },
    async () => {
      const { runImageCopies, runCacheControl } = require("./imageCopies");
      const sharp = require("sharp");
      sharp.cache(false);
      sharp.concurrency(1);
      const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
      const bucket = admin.storage().bucket(admin.app().options.storageBucket || `${projectId}.firebasestorage.app`);
      const start = Date.now();
      try {
        const copies = await runImageCopies({ db, bucket, sharp, deadline: start + 200_000 });
        if (copies.found) console.log("storageImageSweep: photo copies", copies);
      } catch (err) { console.error("storageImageSweep: photo copies failed:", err.message); }
      try {
        const cache = await runCacheControl({ db, bucket, deadline: Math.max(Date.now() + 20_000, start + 260_000) });
        if (cache.updated) console.log("storageImageSweep: cache headers", cache);
      } catch (err) { console.error("storageImageSweep: cache headers failed:", err.message); }
    }
  );

  const backInStockSweep = onSchedule(
    { schedule: "every 15 minutes", timeoutSeconds: 300, secrets: [RESEND_API_KEY] },
    async () => {
      const deadline = Date.now() + RESTOCK_BUDGET_MS;
      const snap = await db.collection("stockAlerts").where("restockPending", "==", true).limit(300).get();
      if (snap.empty) return;
      const byBook = new Map();
      for (const doc of snap.docs) {
        const bookId = String(doc.data().bookId || "");
        if (!byBook.has(bookId)) byBook.set(bookId, []);
        byBook.get(bookId).push(doc);
      }
      const clear = doc => doc.ref.update({ restockPending: false, releasePending: false }).catch(() => {});
      for (const [bookId, alerts] of byBook) {
        if (Date.now() >= deadline) break;
        const bookSnap = bookId && !bookId.includes("/") ? await db.collection("books").doc(bookId).get().catch(() => null) : null;
        const book = bookSnap?.exists ? bookSnap.data() : null;
        // Back to "Coming soon" before the sweep ran: wait for its next release.
        if (!book || book.isTest === true || (book.status && book.status !== "published") || book.comingSoon === true) { await Promise.all(alerts.map(clear)); continue; }
        const available = new Set();
        if (stockOf(book, 1) > 0) available.add("");
        // A release signup is for the whole book: any edition in stock will do.
        if (alerts.some(doc => doc.data().releasePending === true) && (Array.isArray(book.variants) ? book.variants : []).some(v => stockOf(v, 1) > 0)) available.add("");
        for (const v of Array.isArray(book.variants) ? book.variants : []) if (stockOf(v, 1) > 0) available.add(String(v.id));
        const due = alerts.filter(doc => available.has(String(doc.data().variantId || "")));
        await Promise.all(alerts.filter(doc => !due.includes(doc)).map(clear));
        if (due.length) await sendRestockAlerts({ bookId, book, docs: due, deadline }).catch(err => console.error("backInStockSweep:", err.message));
      }
    },
  );

  return { dailyOrderDigest, weeklySummary, abandonedCartSweep, storageImageSweep, backInStockSweep };
}

module.exports = { scheduledJobs };
