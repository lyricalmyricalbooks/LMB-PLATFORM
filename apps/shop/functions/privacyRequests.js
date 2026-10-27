// Newsletter double opt-in and privacy requests of createStripeCheckoutSession: signup and its confirmation link,
// a shopper's request for their data or its erasure, and the admin's export and erase. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own db, admin SDK, email sender and
// guards, so the vm-based handler tests' fakes still apply.

function privacyActions({
  db, admin, ADMIN_TO, GIFT_CARD_PERSONAL, LIMITS, RESEND_API_KEY, claimEmailSendDetailed, confirmationEmail,
  confirmedRecord, escapeHtml, findByEmailData, footerAddress, giftCardsFor, hitLimit, marketingUnsubscribeKey,
  neverPaid, normMarketingEmail, optOutId, pendingRecord, privacyRequestRecord, publicOutboxEntry,
  purposeToken, purposeTokenMatches, readAdminSecret, redactedOperationsFields, redactedOrderFields,
  requireAdmin, reviewErasure, sendEmail, siteLink, unsubscribeToken,
}) {
  // ──────────────────────────────────────────────────────────────
  // Newsletter double opt-in. Signup stores a PENDING record (+ consent text and time) and mails a signed
  // confirmation link; only the link makes the address a subscriber. Browsers never write `newsletter`
  // (firestore.rules), so a stranger cannot seed the list. Unsubscribe is the shared signed link
  // (`action: "unsubscribe"`), which deletes newsletter/<email> and records the opt-out.
  // ──────────────────────────────────────────────────────────────
  const newsletterLinks = async email => {
    const key = await marketingUnsubscribeKey();
    const e = encodeURIComponent(normMarketingEmail(email));
    return {
      confirmUrl: siteLink(`/track?newsletter_confirm=1&e=${e}&t=${purposeToken(email, key, "newsletter-confirm")}`),
      unsubscribeUrl: siteLink(`/track?unsubscribe=1&e=${e}&t=${unsubscribeToken(email, key)}`),
    };
  };

  async function handleNewsletterSignup(req, res) {
    if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
    const email = normMarketingEmail(req.body?.email);
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(email) || email.length > 254) return res.status(400).json({ error: "invalid" });
    try {
      const ref = db.collection("newsletter").doc(email);
      const existing = await ref.get();
      // Already confirmed (or a legacy subscriber): nothing to send, and the answer looks the same.
      if (existing.exists && existing.data()?.status !== "pending") return res.status(200).json({ ok: true });
      const claim = await claimEmailSendDetailed(db, "newsletterConfirm", email, { failOpen: false });
      if (!claim.allowed) {
        // A confirmation went to this address in the last day: stay quiet. Over the shop-wide budget: ask to retry.
        if (claim.reason === "address") return res.status(200).json({ ok: true });
        return res.status(429).json({ error: "busy" });
      }
      await ref.set(pendingRecord(email, req.body?.source, new Date().toISOString()));
      const { confirmUrl, unsubscribeUrl } = await newsletterLinks(email);
      const website = (await db.collection("settings").doc("website").get()).data() || {};
      const mail = confirmationEmail({ shopName: "Lyricalmyrical Books", confirmUrl, unsubscribeUrl, address: footerAddress(website.location) });
      await sendEmail({ queue: "newsletterConfirm", secret: RESEND_API_KEY.value(), to: email, subject: mail.subject, html: mail.html })
        .catch(err => console.warn("newsletter confirmation email failed:", err.message));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Newsletter signup failed:", err);
      return res.status(500).json({ error: "failed" });
    }
  }

  async function handleNewsletterConfirm(req, res) {
    if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
    const email = normMarketingEmail(req.body?.email);
    const key = (await readAdminSecret("marketing")).unsubscribeKey;
    if (!email || !purposeTokenMatches(email, String(req.body?.token || ""), key, "newsletter-confirm")) return res.status(400).json({ error: "invalid_link" });
    try {
      const ref = db.collection("newsletter").doc(email);
      const snap = await ref.get();
      // No record: it was removed (unsubscribed or erased) after the email went out, so the old link must not revive it.
      if (!snap.exists) return res.status(410).json({ error: "expired" });
      const next = confirmedRecord(snap.data(), new Date().toISOString());
      if (next !== snap.data()) await ref.set(next);
      return res.status(200).json({ confirmed: true });
    } catch (err) {
      console.error("Newsletter confirm failed:", err);
      return res.status(500).json({ error: "failed" });
    }
  }

  // A privacy request (copy of my data / delete my data). Anyone can ask, so nothing is
  // sent or deleted automatically: the shop confirms the person owns the address (reply
  // from it), then uses Settings › Privacy requests to export or erase.
  async function handlePrivacyRequest(req, res) {
    const { email, type, message } = req.body || {};
    if (!(await hitLimit(db, "track", req, LIMITS.track))) {
      res.status(429).json({ error: "too_many" });
      return;
    }
    const record = privacyRequestRecord(email, type, message);
    if (!record) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    try {
      // Anyone can type any address: the same address asking again within a day adds neither a
      // second record nor a second email, and the shop-wide email budget caps the rest. A request
      // over the budget is still recorded (Settings › General › Privacy requests) but not mailed.
      const claim = await claimEmailSendDetailed(db, "privacyNotify", record.email, { failOpen: true });
      if (!claim.allowed && claim.reason === "address") {
        res.status(200).json({ ok: true });
        return;
      }
      await db.collection("privacyRequests").add(record);
      if (!claim.allowed) {
        res.status(200).json({ ok: true });
        return;
      }
      await sendEmail({
        queue: "privacyRequest",
        secret: RESEND_API_KEY.value(),
        to: ADMIN_TO,
        subject: `Privacy request (${record.type === "delete" ? "delete data" : "copy of data"}) · ${record.email}`,
        html: `<p><strong>${escapeHtml(record.email)}</strong> asked for ${record.type === "delete" ? "their personal data to be deleted" : "a copy of their personal data"}.</p>${record.message ? `<blockquote>${escapeHtml(record.message)}</blockquote>` : ""}<p>Confirm the request by email with that address first, then open Admin › Settings › General › Privacy requests.</p>`,
      }).catch(err => console.warn("privacy request email failed:", err.message));
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Privacy request failed:", err);
      res.status(500).json({ error: "failed" });
    }
  }

  // Everything the shop holds about one email address (any capitalisation: see privacyData.js).
  async function personalDataFor(email) {
    const [orders, alerts, carts, contacts, messages, newsletter, queuedEmails, emailRows, giftCards] = await Promise.all([
      findByEmailData(db, "orders", "customer.email", email), findByEmailData(db, "stockAlerts", "email", email),
      findByEmailData(db, "abandoned-carts", "email", email), findByEmailData(db, "reviewContacts", "email", email),
      findByEmailData(db, "contactMessages", "email", email), db.collection("newsletter").doc(email).get(),
      // Emails waiting in the retry queue to or about this person, and their delivery-log rows
      // (`to` can list several recipients, so it is matched as a list).
      db.collection("emailOutbox").where("toLower", "array-contains", email).get().then(s => s.docs),
      findByEmailData(db, "emailLog", "to", email, { contains: true }),
      giftCardsFor(db, email),
    ]);
    // Private fulfilment notes kept about the person's orders (admin-only order-operations).
    const operations = orders.length ? (await db.getAll(...orders.map(o => db.collection("order-operations").doc(o.id)))).filter(d => d.exists) : [];
    let user = null;
    try { user = await admin.auth().getUserByEmail(email); } catch { user = null; }
    const profile = user ? await db.collection("customers").doc(user.uid).get() : null;
    const reviews = contacts.length
      ? (await Promise.all(contacts.map(c => db.collection("reviews").doc(c.id).get()))).filter(r => r.exists)
      : [];
    const incompleteScan = [["orders", orders], ["stockAlerts", alerts], ["abandoned-carts", carts], ["reviewContacts", contacts], ["contactMessages", messages], ["emailLog", emailRows]].filter(([, d]) => d.truncated).map(([n]) => n);
    return { orders, alerts, carts, contacts, messages, newsletter, user, profile, reviews, queuedEmails, emailRows, giftCards, operations, incompleteScan };
  }

  async function handlePrivacyAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(email)) {
      res.status(400).json({ error: "Enter the customer's email address." });
      return;
    }
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    try {
      const data = await personalDataFor(email);
      const rows = docs => docs.map(d => ({ id: d.id, ...d.data() }));
      if (req.body.action === "privacyExport") {
        const strip = o => { const { downloadToken, trackingKey, clientIp, ...rest } = o; return rest; };
        res.status(200).json({
          email,
          exportedAt: new Date().toISOString(),
          account: data.user ? { uid: data.user.uid, createdAt: data.user.metadata?.creationTime || null } : null,
          profile: data.profile?.exists ? data.profile.data() : null,
          newsletter: data.newsletter.exists ? data.newsletter.data() : null,
          orders: rows(data.orders).map(strip),
          orderNotesAndHistory: rows(data.operations),
          backInStockAlerts: rows(data.alerts),
          savedCarts: rows(data.carts),
          reviews: data.reviews.map(r => ({ id: r.id, ...r.data() })),
          contactMessages: rows(data.messages),
          giftCards: rows(data.giftCards).map(({ code, holds, ...card }) => card),
          emailDeliveryLog: rows(data.emailRows).map(({ toLower, ...row }) => row),
          emailsWaitingToSend: data.queuedEmails.map(d => publicOutboxEntry(d.id, d.data())),
          ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
        });
        if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "exported", handledAt: new Date().toISOString(), handledBy: adminUser.email }, { merge: true });
        return;
      }
      // Erase: delete marketing, cart, alert, contact and account data. Orders that were never paid
      // lose the customer's details; paid orders stay (tax and accounting records) with their
      // private notes blanked. Gift cards keep their balance but lose names, emails and message.
      // Reviews lose the name, and (admin's choice) are unpublished or lose their text.
      const reviewMode = ["unpublish", "remove-text"].includes(req.body?.reviewAction) ? req.body.reviewAction : "anonymize";
      const now = new Date().toISOString();
      const ops = [];
      for (const d of [...data.alerts, ...data.carts, ...data.contacts, ...data.messages, ...data.queuedEmails, ...data.emailRows]) ops.push(b => b.delete(d.ref));
      if (data.newsletter.exists) ops.push(b => b.delete(data.newsletter.ref));
      if (data.profile?.exists) ops.push(b => b.delete(data.profile.ref));
      for (const r of data.reviews) ops.push(b => b.update(r.ref, reviewErasure(reviewMode)));
      const redactedOrders = data.orders.filter(d => neverPaid(d.data()));
      const keptOrders = data.orders.filter(d => !neverPaid(d.data()));
      const redactedIds = new Set(redactedOrders.map(d => d.id));
      for (const d of redactedOrders) ops.push(b => b.update(d.ref, redactedOrderFields(now)));
      for (const d of data.operations) {
        if (redactedIds.has(d.id)) ops.push(b => b.delete(d.ref));
        else ops.push(b => b.set(d.ref, redactedOperationsFields(d.data(), now), { merge: true }));
      }
      for (const d of data.giftCards) ops.push(b => b.update(d.ref, { ...GIFT_CARD_PERSONAL, privacyRedactedAt: now }));
      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + 400)) op(batch);
        await batch.commit();
      }
      if (data.user) await admin.auth().deleteUser(data.user.uid);
      await db.collection("marketing-optout").doc(optOutId(email)).set({ at: now, source: "privacy-erase" }).catch(() => {});
      const summary = {
        deleted: { backInStockAlerts: data.alerts.length, savedCarts: data.carts.length, reviewContacts: data.contacts.length, contactMessages: data.messages.length, queuedEmails: data.queuedEmails.length, emailLogRows: data.emailRows.length, newsletter: data.newsletter.exists ? 1 : 0, account: data.user ? 1 : 0 },
        anonymizedReviews: data.reviews.length,
        reviewAction: reviewMode,
        redactedUnpaidOrders: redactedOrders.map(d => d.id),
        redactedGiftCards: data.giftCards.length,
        keptOrders: keptOrders.map(d => d.id),
        ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
      };
      if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "erased", handledAt: now, handledBy: adminUser.email, summary }, { merge: true });
      res.status(200).json(summary);
    } catch (err) {
      console.error("Privacy action failed:", err);
      res.status(500).json({ error: "The privacy action failed. Try again; nothing is half-deleted that a retry won't finish." });
    }
  }

  return { handleNewsletterSignup, handleNewsletterConfirm, handlePrivacyRequest, handlePrivacyAdmin };
}

module.exports = { privacyActions };
