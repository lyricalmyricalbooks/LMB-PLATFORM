// Newsletter double opt-in and privacy requests of createStripeCheckoutSession: signup and its confirmation link,
// a shopper's request for their data or its erasure, and the admin's export and erase. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own db, admin SDK, email sender and
// guards, so the vm-based handler tests' fakes still apply.

const crypto = require("crypto");
const { pressName } = require("./shared/shopIdentity");
const { shopConfig } = require("./shopConfig");
const { bookingPaid, redactedBookingFields, redactedTicketOrderFields } = require("./privacyData");

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
      // The press's own name (Sender name, else Text & labels › Site name; plan 5.8) in the email and the consent.
      const website = (await db.collection("settings").doc("website").get()).data() || {};
      const shopName = String(website.communications?.fromName || "").trim() || pressName(website, shopConfig.senderName);
      await ref.set(pendingRecord(email, req.body?.source, new Date().toISOString(), shopName));
      const { confirmUrl, unsubscribeUrl } = await newsletterLinks(email);
      const mail = confirmationEmail({ shopName, confirmUrl, unsubscribeUrl, address: footerAddress(website.location) });
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
        to: (typeof ADMIN_TO === "function" ? ADMIN_TO() : ADMIN_TO),
        subject: `Privacy request (${record.type === "delete" ? "delete data" : "copy of data"}) · ${record.email}`,
        html: `<p><strong>${escapeHtml(record.email)}</strong> asked for ${record.type === "delete" ? "their personal data to be deleted" : "a copy of their personal data"}.</p>${record.message ? `<blockquote>${escapeHtml(record.message)}</blockquote>` : ""}<p>Confirm the request by email with that address first, then open Admin › Settings › General › Privacy requests.</p>`,
      }).catch(err => console.warn("privacy request email failed:", err.message));
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Privacy request failed:", err);
      res.status(500).json({ error: "failed" });
    }
  }

  // Everything the shop holds about one email address (any capitalisation: see privacyData.js). `scan: false` (the
  // shopper's own copy) uses indexed lookups only, so a signed-in visitor can never make the shop read whole collections.
  async function personalDataFor(email, { scan = true } = {}) {
    const find = (collection, field, options = {}) => findByEmailData(db, collection, field, email, { ...options, scan });
    const [orders, alerts, carts, contacts, messages, newsletter, queuedEmails, emailRows, giftCards, bookings, waiting, packs, ticketOrders, forms, intro, visits, gifts, memberships, giftsBought, giftsReceived, rentals] = await Promise.all([
      find("orders", "customer.email"), find("stockAlerts", "email"),
      find("abandoned-carts", "email"), find("reviewContacts", "email"),
      find("contactMessages", "email"), db.collection("newsletter").doc(email).get(),
      // Emails waiting in the retry queue to or about this person, and their delivery-log rows
      // (`to` can list several recipients, so it is matched as a list).
      db.collection("emailOutbox").where("toLower", "array-contains", email).get().then(s => s.docs),
      find("emailLog", "to", { contains: true }),
      giftCardsFor(db, email),
      // Times they booked and waiting lists they joined (bookings.js).
      find("bookings", "customer.email"),
      // Both waiting lists: a full day or class (bookingWaitlist) and "tell me if an earlier time opens" (bookingEarlier).
      Promise.all([find("bookingWaitlist", "email"), find("bookingEarlier", "email")]).then(([days, earlier]) => Object.assign([...days, ...earlier], { truncated: !!(days.truncated || earlier.truncated) })),
      // Packs of visits they bought (bookings.js).
      find("bookingPacks", "customer.email"),
      // Event tickets they bought (events.js).
      find("eventOrders", "customer.email"),
      // The form they signed before their first visit (bookings.js, health answers).
      find("bookingForms", "email"),
      // Their first-visit price claim (bookings.js), kept under a hash of the address.
      db.collection("bookingIntros").doc(crypto.createHash("sha256").update(email).digest("hex")).get(),
      // The team's visit notes and before/after photos (admin-only clientVisits). The owner's export and erase cover them;
      // the shopper's own copy leaves them out: they are the team's private notes, not something the shopper gave.
      scan ? find("clientVisits", "email") : Promise.resolve(Object.assign([], { truncated: false })),
      // Gifts they gave from the Support page (giving.js).
      find("gifts", "customer.email"),
      // Their memberships (memberships.js).
      find("memberships", "customer.email"),
      // Gift memberships they bought, or were given (memberships.js, M5a).
      find("membershipGifts", "buyer.email"),
      find("membershipGifts", "to.email"),
      // Things they rented (rentals.js).
      find("rentals", "customer.email"),
    ]);
    const memberGifts = Object.assign([...new Map([...giftsBought, ...giftsReceived].map((d) => [d.id, d])).values()], { truncated: !!(giftsBought.truncated || giftsReceived.truncated) });
    // Private fulfilment notes kept about the person's orders (admin-only order-operations).
    const operations = orders.length ? (await db.getAll(...orders.map(o => db.collection("order-operations").doc(o.id)))).filter(d => d.exists) : [];
    let user = null;
    try { user = await admin.auth().getUserByEmail(email); } catch { user = null; }
    const profile = user ? await db.collection("customers").doc(user.uid).get() : null;
    const reviews = contacts.length
      ? (await Promise.all(contacts.map(c => db.collection("reviews").doc(c.id).get()))).filter(r => r.exists)
      : [];
    const incompleteScan = [["orders", orders], ["stockAlerts", alerts], ["abandoned-carts", carts], ["reviewContacts", contacts], ["contactMessages", messages], ["emailLog", emailRows], ["bookings", bookings], ["bookingWaitlist", waiting], ["bookingPacks", packs], ["eventOrders", ticketOrders], ["bookingForms", forms], ["clientVisits", visits], ["gifts", gifts], ["memberships", memberships], ["membershipGifts", memberGifts], ["rentals", rentals]].filter(([, d]) => d.truncated).map(([n]) => n);
    return { orders, alerts, carts, contacts, messages, newsletter, user, profile, reviews, queuedEmails, emailRows, giftCards, bookings, waiting, packs, ticketOrders, forms, intro, visits, gifts, memberships, memberGifts, rentals, operations, incompleteScan };
  }

  // The personal-data file for one person: what the admin downloads, and what a signed-in shopper downloads for themselves.
  function exportBody(data, email) {
    const rows = docs => docs.map(d => ({ id: d.id, ...d.data() }));
    const strip = o => { const { downloadToken, trackingKey, clientIp, ...rest } = o; return rest; };
    return {
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
      bookings: rows(data.bookings).map(({ manageKeyHash, pendingKey, sessions, paidSession, paymentIntent, ...booking }) => booking),
      bookingWaitingList: rows(data.waiting),
      bookingForms: rows(data.forms),
      bookingFirstVisitPrice: data.intro?.exists ? { bookingId: data.intro.data()?.bookingId || null, at: data.intro.data()?.at || null } : null,
      ...(data.visits.length ? { clientVisitNotes: rows(data.visits) } : {}),
      // A pack's code is the customer's key: never in the file (only its last four are kept anyway).
      bookingPacks: rows(data.packs).map(({ pendingCode, sessions, paidSession, paymentIntent, mode, ...pack }) => pack),
      // Event tickets: the codes are theirs; the link keys and payment ids stay out.
      eventTickets: rows(data.ticketOrders).map(({ keyHashes, pendingKey, sessions, paidSession, paymentIntent, ticketCodes, mode, ...order }) => order),
      // Gifts: the amounts and what they wrote; the link keys and payment ids stay out.
      gifts: rows(data.gifts || []).map(({ keyHashes, pendingKey, sessions, paidSession, paymentIntent, mode, ...gift }) => gift),
      // Memberships: the plan, its state and dates, and the card's last four; the card pages and provider ids stay out.
      memberships: rows(data.memberships || []).filter(m => !m.neverStarted).map(({ sessions, cardSessions, subscription, stripeCustomer, checkAfter, mode, ...m }) => m),
      // Gift memberships: the plan, the months, who it was from or for and the message; the card page stays out.
      membershipGifts: rows(data.memberGifts || []).map(({ sessions, paymentIntent, checkAfter, mode, ...g }) => g),
      // Rentals: the item, times and money; the link keys, card ids and payment pages stay out (the card's last four stay).
      rentals: rows(data.rentals || []).map(({ keyHashes, pendingKey, sessions, paymentIntent, extraPages, feeCharging, mode, card, ...r }) => ({ ...r, ...(card ? { card: { brand: card.brand || "", last4: card.last4 || "" } } : {}) })),
      emailDeliveryLog: rows(data.emailRows).map(({ toLower, ...row }) => row),
      emailsWaitingToSend: data.queuedEmails.map(d => publicOutboxEntry(d.id, d.data())),
      ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
    };
  }

  // "Your data" in the shopper's own account (plan 14.7). The shopper is signed in with a verified email, so there is no
  // doubt whose data it is: a copy downloads at once, and a deletion request goes to the owner marked as verified, who
  // approves it with one tap in Settings › General › Privacy requests. Nothing is erased until the owner approves.
  async function handleMyData(req, res) {
    if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
    const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
    let decoded = null;
    try { decoded = match ? await admin.auth().verifyIdToken(match[1]) : null; } catch { decoded = null; }
    const email = String(decoded?.email || "").trim().toLowerCase();
    if (!decoded || !email || decoded.email_verified === false) return res.status(401).json({ error: "sign_in" });
    try {
      if (req.body?.action === "myDataExport") {
        // A few copies an hour per account, on top of the per-connection limit above.
        if (!(await hitLimit(db, "myDataExport", req, LIMITS.myDataExport, { key: `uid:${decoded.uid || email}` }))) return res.status(429).json({ error: "too_many" });
        return res.status(200).json(exportBody(await personalDataFor(email, { scan: false }), email));
      }
      const open = await db.collection("privacyRequests").where("email", "==", email).where("status", "==", "open").get();
      if (open.docs.some(d => d.data()?.verified === true && d.data()?.type === "delete")) return res.status(200).json({ ok: true, already: true });
      const record = privacyRequestRecord(email, "delete", "Asked from the shopper's signed-in account.");
      await db.collection("privacyRequests").add({ ...record, verified: true, source: "account", uid: decoded.uid });
      const claim = await claimEmailSendDetailed(db, "privacyNotify", email, { failOpen: true });
      if (claim.allowed) {
        await sendEmail({
          queue: "privacyRequest",
          secret: RESEND_API_KEY.value(),
          to: (typeof ADMIN_TO === "function" ? ADMIN_TO() : ADMIN_TO),
          subject: `Privacy request (delete data, signed in) · ${email}`,
          html: `<p><strong>${escapeHtml(email)}</strong> asked, from their signed-in account, for their personal data to be deleted. Their sign-in already proves the address is theirs.</p><p>Approve it with one tap in Admin › Settings › General › Privacy requests.</p>`,
        }).catch(err => console.warn("privacy request email failed:", err.message));
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("My data request failed:", err);
      return res.status(500).json({ error: "failed" });
    }
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
      if (req.body.action === "privacyExport") {
        res.status(200).json(exportBody(data, email));
        if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "exported", handledAt: new Date().toISOString(), handledBy: adminUser.email }, { merge: true });
        return;
      }
      // Erase: delete marketing, cart, alert, contact and account data. Orders that were never paid
      // lose the customer's details; paid orders stay (tax and accounting records) with their
      // private notes blanked. Gift cards keep their balance but lose names, emails and message.
      // Reviews lose the name, and (admin's choice) are unpublished or lose their text.
      // A membership still running would keep charging a person the shop can no longer name: end it first (Members).
      const running = (data.memberships || []).filter(d => ["trial", "active", "ending", "pastDue"].includes(d.data()?.state));
      if (running.length) {
        res.status(409).json({ error: "This customer still has a membership running. End it on the Members page first, then erase.", code: "membership_running", memberships: running.map(d => d.id) });
        return;
      }
      // A rental not yet settled (held, paid, out) still needs the customer: the owner may charge a fee on the kept card.
      const openRentals = (data.rentals || []).filter(d => ["held", "paid", "out"].includes(d.data()?.status));
      if (openRentals.length) {
        res.status(409).json({ error: "This customer has a rental that isn't back yet. Mark it returned or cancel it on the Rentals page first, then erase.", code: "rental_open", rentals: openRentals.map(d => d.id) });
        return;
      }
      const reviewMode = ["unpublish", "remove-text"].includes(req.body?.reviewAction) ? req.body.reviewAction : "anonymize";
      const now = new Date().toISOString();
      const ops = [];
      // The visit photos named by the notes about to go (only paths inside the client-photos folder).
      const photoPaths = data.visits.flatMap(d => (d.data()?.photos || []).map(p => p?.path)).filter(p => typeof p === "string" && /^client-photos\/[0-9a-f]{64}\/[A-Za-z0-9._-]{1,120}$/.test(p));
      for (const d of [...data.alerts, ...data.carts, ...data.contacts, ...data.messages, ...data.queuedEmails, ...data.emailRows, ...data.waiting, ...data.forms, ...data.visits]) ops.push(b => b.delete(d.ref));
      // A pack never paid for is just a card page that was opened: it goes. A paid one is a payment record, kept like a
      // card-paid booking (its name and email; it holds nothing else about the person).
      const unpaidPacks = data.packs.filter(d => d.data()?.status === "held");
      for (const d of unpaidPacks) ops.push(b => b.delete(d.ref));
      if (data.newsletter.exists) ops.push(b => b.delete(data.newsletter.ref));
      if (data.intro?.exists) ops.push(b => b.delete(data.intro.ref));
      if (data.profile?.exists) ops.push(b => b.delete(data.profile.ref));
      for (const r of data.reviews) ops.push(b => b.update(r.ref, reviewErasure(reviewMode)));
      const redactedOrders = data.orders.filter(d => neverPaid(d.data()));
      const keptOrders = data.orders.filter(d => !neverPaid(d.data()));
      const redactedIds = new Set(redactedOrders.map(d => d.id));
      for (const d of redactedOrders) {
        ops.push(b => b.update(d.ref, redactedOrderFields(now, d.data())));
        // The payment link's own copy of that note (paymentLinks.js, plan 21.1).
        if (d.data()?.paymentLink) ops.push(b => b.set(db.collection("paymentLinks").doc(d.id), { note: "" }, { merge: true }));
      }
      for (const d of data.operations) {
        if (redactedIds.has(d.id)) ops.push(b => b.delete(d.ref));
        else ops.push(b => b.set(d.ref, redactedOperationsFields(d.data(), now), { merge: true }));
      }
      for (const d of data.giftCards) ops.push(b => b.update(d.ref, { ...GIFT_CARD_PERSONAL, privacyRedactedAt: now }));
      // Bookings: card-paid ones stay as payment records without the note, answers and phone; the rest lose every detail.
      for (const d of data.bookings) ops.push(b => b.update(d.ref, redactedBookingFields(d.data(), now)));
      // Event tickets: an order paid by card stays a payment record with its name and email; a free or unpaid one loses
      // them. Either way the buyer's links stop working. The tickets themselves still work at the door.
      for (const d of data.ticketOrders) ops.push(b => b.update(d.ref, redactedTicketOrderFields(d.data(), now)));
      // Gifts: the same rule. A gift paid by card stays a payment record with its name and email; any other loses them.
      // The posting address for a reward and the gift's place on a fundraiser's wall go either way (G2b). A tax receipt (G3)
      // is kept as issued: a charity must keep a copy of every receipt it gave. The giver's own copy of the address goes.
      const walls = new Map();
      for (const d of data.gifts || []) {
        ops.push(b => b.update(d.ref, { ...redactedTicketOrderFields(d.data(), now), shipTo: null, wall: false, receiptAddress: null }));
        const fund = d.data()?.fundraiserId;
        if (fund && d.data()?.wall === true) walls.set(fund, [...(walls.get(fund) || []), d.id]);
      }
      for (const [fund, ids] of walls) {
        const ref = db.collection("fundraisers").doc(String(fund));
        const snap = await ref.get().catch(() => null);
        const entries = snap?.exists && Array.isArray(snap.data().wallEntries) ? snap.data().wallEntries : null;
        if (entries) ops.push(b => b.set(ref, { wallEntries: entries.filter((w) => !ids.includes(w?.gift)), updatedAt: now }, { merge: true }));
      }
      // Memberships (none running: refused above). An ended or never-started one loses the name and the card; its email
      // stays only when it started (a payment record).
      for (const d of data.memberships || []) {
        const m = d.data() || {};
        ops.push(b => b.update(d.ref, { "customer.name": "", "customer.uid": "", card: null, ...(m.startedAt ? {} : { "customer.email": "" }), privacyRedactedAt: now }));
      }
      // Rentals: one paid by card stays a payment record with its name and email; any other loses them. The kept card and
      // the links go either way.
      for (const d of data.rentals || []) {
        const r = d.data() || {};
        const paid = r.chargedMinor > 0 && r.status !== "held";
        ops.push(b => b.update(d.ref, { keyHashes: [], pendingKey: null, card: null, extraPages: [], extraOpen: false, privacyRedactedAt: now, updatedAt: now, ...(paid ? {} : { customer: { name: "Details removed", email: "" } }) }));
      }
      // Gift memberships: the names and the message go; an email stays only on a paid gift (a payment record).
      for (const d of data.memberGifts || []) {
        const g = d.data() || {};
        const paid = g.state === "paid";
        const bought = String(g.buyer?.email || "").toLowerCase() === email;
        ops.push(b => b.update(d.ref, {
          message: "", "to.name": "", ...(bought ? { "buyer.name": "", "buyer.uid": "", ...(paid ? {} : { "buyer.email": "" }) } : (paid ? {} : { "to.email": "" })), privacyRedactedAt: now,
        }));
      }
      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + 400)) op(batch);
        await batch.commit();
      }
      // The visit photos go with their notes. A file already gone counts as removed; one that won't delete is reported.
      const photosLeft = [];
      for (const path of photoPaths) {
        try { await admin.storage().bucket().file(path).delete({ ignoreNotFound: true }); } catch { photosLeft.push(path); }
      }
      if (data.user) await admin.auth().deleteUser(data.user.uid);
      await db.collection("marketing-optout").doc(optOutId(email)).set({ at: now, source: "privacy-erase" }).catch(() => {});
      const summary = {
        deleted: { backInStockAlerts: data.alerts.length, savedCarts: data.carts.length, reviewContacts: data.contacts.length, contactMessages: data.messages.length, queuedEmails: data.queuedEmails.length, emailLogRows: data.emailRows.length, waitingList: data.waiting.length, bookingForms: data.forms.length, clientVisits: data.visits.length, clientPhotos: photoPaths.length - photosLeft.length, unpaidPacks: unpaidPacks.length, newsletter: data.newsletter.exists ? 1 : 0, account: data.user ? 1 : 0 },
        anonymizedReviews: data.reviews.length,
        reviewAction: reviewMode,
        redactedUnpaidOrders: redactedOrders.map(d => d.id),
        redactedGiftCards: data.giftCards.length,
        keptOrders: keptOrders.map(d => d.id),
        keptBookings: data.bookings.filter(d => bookingPaid(d.data())).map(d => d.id),
        redactedBookings: data.bookings.filter(d => !bookingPaid(d.data())).map(d => d.id),
        ticketOrders: data.ticketOrders.length,
        gifts: (data.gifts || []).length,
        memberships: (data.memberships || []).length,
        membershipGifts: (data.memberGifts || []).length,
        rentals: (data.rentals || []).length,
        ...(photosLeft.length ? { photosNotDeleted: photosLeft } : {}),
        ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
      };
      if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "erased", handledAt: now, handledBy: adminUser.email, summary }, { merge: true });
      res.status(200).json(summary);
    } catch (err) {
      console.error("Privacy action failed:", err);
      res.status(500).json({ error: "The privacy action failed. Try again; nothing is half-deleted that a retry won't finish." });
    }
  }

  return { handleNewsletterSignup, handleNewsletterConfirm, handlePrivacyRequest, handlePrivacyAdmin, handleMyData };
}

module.exports = { privacyActions };
